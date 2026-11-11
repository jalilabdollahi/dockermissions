import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { Mission } from "../missions/types.js";
import { ensureDir } from "../utils/fs.js";
import { SandboxRuntime } from "./SandboxRuntime.js";

export interface SandboxSession {
  id: string;
  missionId: string;
  createdAt: number;
  expiresAt: number;
  /** Session directory on the host (contains workspace/, bashrc, commands.log). */
  hostDir: string;
  /** The player's /workspace, as a host path. */
  workspaceDir: string;
  /** rcfile path inside the sandbox. */
  rcFileInSandbox: string;
  commandLogFile: string;
  commandLog: string[];
  commandBuffer: string;
  setupErrors: string[];
}

type SessionListener = (sessionId: string) => void;

export class SandboxManager {
  private sessions = new Map<string, SandboxSession>();
  private destroyListeners = new Set<SessionListener>();
  /** Missions share one sandbox engine, so session creation is serialized. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly runtime: SandboxRuntime) {
    ensureDir(env.sessionRoot);
    setInterval(() => this.cleanupExpiredSessions(), 60_000).unref();
  }

  onDestroy(listener: SessionListener) {
    this.destroyListeners.add(listener);
  }

  createSession(mission: Mission): Promise<SandboxSession> {
    const run = this.queue.then(() => this.createSessionNow(mission));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async createSessionNow(mission: Mission): Promise<SandboxSession> {
    await this.runtime.ensureRunning();

    // Only one mission can own the sandbox engine at a time.
    for (const sessionId of Array.from(this.sessions.keys())) {
      this.destroySession(sessionId);
    }

    const id = randomUUID();
    const hostDir = path.join(env.sessionRoot, id);
    const workspaceDir = path.join(hostDir, "workspace");
    ensureDir(workspaceDir);

    const session: SandboxSession = {
      id,
      missionId: mission.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + env.sessionTtlMinutes * 60_000,
      hostDir,
      workspaceDir,
      rcFileInSandbox: `${this.runtime.sessionPathInSandbox(id)}/bashrc`,
      commandLogFile: path.join(hostDir, "commands.log"),
      commandLog: [],
      commandBuffer: "",
      setupErrors: []
    };

    fs.writeFileSync(session.commandLogFile, "", "utf8");
    fs.writeFileSync(path.join(hostDir, "bashrc"), this.buildRcFile(id), "utf8");

    for (const file of mission.setup.files) {
      const target = this.resolveWorkspacePath(session, file.path);
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, file.content, "utf8");
    }

    await this.runtime.resetForSession(id);
    for (const command of mission.setup.commands) {
      const result = await this.runtime.shell(command, { timeoutMs: 300_000 });
      if (result.exitCode !== 0) {
        const message = `setup command failed (${result.exitCode}): ${command}\n${result.stderr.trim()}`;
        session.setupErrors.push(message);
        console.error(`[sandbox] ${mission.id} ${message}`);
      }
    }

    this.sessions.set(id, session);
    return session;
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  destroySession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    this.sessions.delete(sessionId);
    for (const listener of this.destroyListeners) {
      listener(sessionId);
    }
    fs.rmSync(session.hostDir, { recursive: true, force: true });
    return true;
  }

  touch(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.expiresAt = Date.now() + env.sessionTtlMinutes * 60_000;
    }
  }

  /** Track keystrokes as a fallback command log (history-based logging is the primary source). */
  appendInput(sessionId: string, input: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (input.startsWith("\x1b")) {
      // Arrow keys / escape sequences: the line buffer can no longer be trusted.
      session.commandBuffer = "";
      return;
    }
    for (const char of input) {
      if (char === "\r" || char === "\n") {
        const command = session.commandBuffer.trim();
        if (command) {
          session.commandLog.push(command);
          if (session.commandLog.length > 200) session.commandLog.shift();
        }
        session.commandBuffer = "";
      } else if (char === "\u007f" || char === "\b") {
        session.commandBuffer = session.commandBuffer.slice(0, -1);
      } else if (char === "\u0003" || char === "\u0015") {
        session.commandBuffer = "";
      } else if (char >= " " || char === "\t") {
        session.commandBuffer += char;
      }
    }
    this.touch(sessionId);
  }

  getExecutedCommands(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }
    const fromHistory = fs.existsSync(session.commandLogFile)
      ? fs.readFileSync(session.commandLogFile, "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
      : [];
    return Array.from(new Set([...fromHistory, ...session.commandLog]));
  }

  /** Map a mission path ("app/x", "/workspace/app/x") to the host path inside the session workspace. */
  resolveWorkspacePath(session: SandboxSession, rawPath: string) {
    const relative = rawPath.replace(/^\/workspace\/?/, "").replace(/^\/+/, "");
    const resolved = path.resolve(session.workspaceDir, relative);
    if (resolved !== session.workspaceDir && !resolved.startsWith(session.workspaceDir + path.sep)) {
      throw new Error(`Path escapes the workspace: ${rawPath}`);
    }
    return resolved;
  }

  private buildRcFile(sessionId: string) {
    const logPath = `${this.runtime.sessionPathInSandbox(sessionId)}/commands.log`;
    return [
      "[ -f /etc/dockermissions/bashrc ] && . /etc/dockermissions/bashrc",
      "__dm_last=''",
      "__dm_log() {",
      "  local cmd",
      "  cmd=$(HISTTIMEFORMAT= history 1 | sed -E 's/^ *[0-9]+\\*? *//')",
      "  if [ -n \"$cmd\" ] && [ \"$cmd\" != \"$__dm_last\" ]; then",
      `    printf '%s\\n' "$cmd" >> '${logPath}'`,
      "    __dm_last=\"$cmd\"",
      "  fi",
      "}",
      "PROMPT_COMMAND=__dm_log",
      "cd /workspace"
    ].join("\n") + "\n";
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.destroySession(sessionId);
      }
    }
  }
}
