import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn as spawnProcess } from "node:child_process";
import { IncomingMessage } from "node:http";
import { URL } from "node:url";
import * as pty from "node-pty";
import { WebSocket, WebSocketServer } from "ws";
import { env } from "../config/env.js";
import { SandboxManager, SandboxSession } from "../sandbox/SandboxManager.js";

interface TerminalShell {
  localEcho?: boolean;
  onData(callback: (data: string) => void): void;
  onExit(callback: () => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

/**
 * node-pty ships a `spawn-helper` binary in its macOS prebuilds. npm sometimes installs it without
 * the execute bit, which makes every pty.spawn fail with "posix_spawnp failed". Repair it once.
 */
function ensureSpawnHelperExecutable() {
  try {
    const require = createRequire(import.meta.url);
    const root = path.resolve(path.dirname(require.resolve("node-pty")), "..");
    const candidates = [
      path.join(root, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
      path.join(root, "build", "Release", "spawn-helper")
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const mode = fs.statSync(candidate).mode;
        if ((mode & 0o111) === 0) {
          fs.chmodSync(candidate, mode | 0o755);
          console.log(`[terminal] made ${candidate} executable`);
        }
      }
    }
  } catch (error) {
    console.warn("[terminal] could not check node-pty spawn-helper:", error);
  }
}

ensureSpawnHelperExecutable();

export class TerminalRelay {
  private shells = new Map<string, Set<TerminalShell>>();

  constructor(private sandboxManager: SandboxManager) {
    // When a session is replaced or expires, close its terminals so they can't act on the next mission.
    sandboxManager.onDestroy((sessionId) => {
      for (const shell of this.shells.get(sessionId) ?? []) {
        shell.kill();
      }
      this.shells.delete(sessionId);
    });
  }

  attach(wss: WebSocketServer) {
    wss.on("connection", (socket, request) => {
      if (!this.originAllowed(request)) {
        socket.close(1008, "Origin not allowed");
        return;
      }

      const { session, cols, rows } = this.resolveSession(request);
      if (!session) {
        socket.send("\r\n\x1b[31mSession not found. Select the mission again to get a fresh sandbox.\x1b[0m\r\n");
        socket.close();
        return;
      }

      let shell: TerminalShell;
      try {
        shell = this.spawnShell(session, cols, rows);
      } catch (error) {
        socket.send(`\r\n\x1b[31mCould not open a shell in the sandbox: ${String(error)}\x1b[0m\r\n`);
        socket.close();
        return;
      }

      const set = this.shells.get(session.id) ?? new Set<TerminalShell>();
      set.add(shell);
      this.shells.set(session.id, set);

      shell.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data);
      });
      shell.onExit(() => {
        set.delete(shell);
        if (socket.readyState === WebSocket.OPEN) socket.close();
      });

      socket.on("message", (message) => {
        const raw = message.toString();
        if (raw.startsWith("{")) {
          try {
            const payload = JSON.parse(raw) as { type?: string; cols?: number; rows?: number };
            if (payload.type === "resize" && payload.cols && payload.rows) {
              shell.resize(payload.cols, payload.rows);
              return;
            }
          } catch {
            // Not a control message; treat as terminal input.
          }
        }
        this.sandboxManager.appendInput(session.id, raw);
        if (shell.localEcho) {
          const echo = this.formatLocalEcho(raw);
          if (echo) socket.send(echo);
        }
        shell.write(raw);
      });

      socket.on("close", () => {
        set.delete(shell);
        shell.kill();
      });
    });
  }

  private originAllowed(request: IncomingMessage) {
    const origin = request.headers.origin;
    if (!origin) {
      return true; // non-browser clients (tests, CLI)
    }
    try {
      const { hostname } = new URL(origin);
      const allowedHost = new URL(env.frontendOrigin).hostname;
      return hostname === allowedHost || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    } catch {
      return false;
    }
  }

  private resolveSession(request: IncomingMessage) {
    const url = new URL(request.url ?? "", "http://localhost");
    const sessionId = url.searchParams.get("sessionId");
    const cols = Math.min(Math.max(Number(url.searchParams.get("cols") ?? 120) || 120, 20), 400);
    const rows = Math.min(Math.max(Number(url.searchParams.get("rows") ?? 30) || 30, 5), 200);
    const session = sessionId ? (this.sandboxManager.getSession(sessionId) ?? null) : null;
    return { session, cols, rows };
  }

  private spawnShell(session: SandboxSession, cols: number, rows: number): TerminalShell {
    const container = this.sandboxManager.runtime.containerName;
    const bashArgs = ["bash", "--noprofile", "--rcfile", session.rcFileInSandbox, "-i"];
    const envVars = { ...(process.env as Record<string, string>), TERM: "xterm-256color" };

    try {
      return pty.spawn("docker", ["exec", "-it", "-e", "TERM=xterm-256color", "-w", "/workspace", container, ...bashArgs], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: session.hostDir,
        env: envVars
      });
    } catch (error) {
      console.error("[terminal] node-pty spawn failed; falling back to a pipe shell:", error);
    }

    // Fallback: no TTY. Line editing and full-screen programs won't work, but commands do.
    const child = spawnProcess("docker", ["exec", "-i", "-e", "TERM=dumb", "-w", "/workspace", container, ...bashArgs], {
      cwd: session.hostDir,
      env: envVars,
      stdio: "pipe"
    });
    child.on("error", (error) => console.error("[terminal] fallback shell failed:", error));
    const clean = (data: Buffer) => data.toString().replace(/\r?\n/g, "\r\n").replace(/^bash: no job control in this shell\r\n/m, "");

    return {
      localEcho: true,
      onData(callback) {
        child.stdout.on("data", (data: Buffer) => callback(clean(data)));
        child.stderr.on("data", (data: Buffer) => callback(clean(data)));
      },
      onExit(callback) {
        child.on("close", callback);
      },
      write(data) {
        child.stdin.write(data.replace(/\r/g, "\n"));
      },
      resize() {
        // A pipe cannot be resized.
      },
      kill() {
        child.kill();
      }
    };
  }

  private formatLocalEcho(input: string) {
    let output = "";
    for (const char of input) {
      if (char === "\r" || char === "\n") output += "\r\n";
      else if (char === "\u007f" || char === "\b") output += "\b \b";
      else if (char >= " " || char === "\t") output += char;
    }
    return output;
  }
}
