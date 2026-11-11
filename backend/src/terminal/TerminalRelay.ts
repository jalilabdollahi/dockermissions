import fs from "node:fs";
import path from "node:path";
import { spawn as spawnProcess } from "node:child_process";
import { IncomingMessage } from "node:http";
import { URL } from "node:url";
import * as pty from "node-pty";
import { WebSocketServer } from "ws";
import { SandboxManager } from "../sandbox/SandboxManager.js";

interface TerminalShell {
  localEcho?: boolean;
  onData(callback: (data: string) => void): void;
  onExit(callback: () => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export class TerminalRelay {
  constructor(private sandboxManager: SandboxManager) {}

  attach(wss: WebSocketServer) {
    wss.on("connection", (socket, request) => {
      const { session, cols, rows } = this.resolveSession(request);
      if (!session) {
        socket.send("Session not found.\r\n");
        socket.close();
        return;
      }

      const rcFilePath = path.join(session.workspaceDir, ".dockermissions_bashrc");
      const safeDir = session.workspaceDir.replace(/'/g, "'\\''");
      const safeCommandLogPath = session.commandLogFile.replace(/'/g, "'\\''");
      fs.writeFileSync(
        rcFilePath,
        [
          "[ -f /etc/bash.bashrc ] && . /etc/bash.bashrc",
          "[ -f ~/.bashrc ] && . ~/.bashrc",
          "unset PROMPT_COMMAND",
          "export PS1='[dockermissions]$ '",
          "__dockermissions_last_logged=''",
          "__dockermissions_log_command() {",
          "  local cmd",
          "  cmd=$(history 1 | sed 's/^ *[0-9]\\+ *//')",
          "  if [ -n \"$cmd\" ] && [ \"$cmd\" != \"$__dockermissions_last_logged\" ]; then",
          `    printf '%s\\n' \"$cmd\" >> '${safeCommandLogPath}'`,
          "    __dockermissions_last_logged=\"$cmd\"",
          "  fi",
          "}",
          "trap '__dockermissions_log_command' DEBUG",
          `cd '${safeDir}'`
        ].join("\n") + "\n",
        "utf8"
      );

      const shell = this.spawnShell(rcFilePath, session.workspaceDir, cols, rows);

      shell.onData((data) => socket.send(data));
      shell.onExit(() => socket.close());

      socket.on("message", (message) => {
        const raw = message.toString();
        // Resize message: {"type":"resize","cols":N,"rows":N}
        if (raw.startsWith("{")) {
          try {
            const msg = JSON.parse(raw) as { type?: string; cols?: number; rows?: number };
            if (msg.type === "resize" && msg.cols && msg.rows) {
              shell.resize(msg.cols, msg.rows);
              return;
            }
          } catch {
            // fall through to stdin
          }
        }
        this.sandboxManager.appendCommand(session.id, raw);
        if (shell.localEcho) {
          const echo = this.formatLocalEcho(raw);
          if (echo) {
            socket.send(echo);
          }
        }
        shell.write(raw);
      });

      socket.on("close", () => {
        shell.kill();
      });
    });
  }

  private resolveSession(request: IncomingMessage) {
    const url = new URL(request.url ?? "", "http://localhost");
    const sessionId = url.searchParams.get("sessionId");
    const cols = Number(url.searchParams.get("cols") ?? 220);
    const rows = Number(url.searchParams.get("rows") ?? 50);
    const session = sessionId ? (this.sandboxManager.getSession(sessionId) ?? null) : null;
    return { session, cols, rows };
  }

  private spawnShell(rcFilePath: string, workspaceDir: string, cols: number, rows: number): TerminalShell {
    const shellPath = "/bin/bash";
    const args = ["--noprofile", "--rcfile", rcFilePath, "-i"];
    const env = {
      ...(process.env as Record<string, string>),
      BASH_SILENCE_DEPRECATION_WARNING: "1",
      TERM: "xterm-256color"
    };

    try {
      return pty.spawn(shellPath, args, {
        name: "xterm-256color",
        cols,
        rows,
        cwd: workspaceDir,
        env
      });
    } catch (error) {
      console.error("[terminal] node-pty spawn failed; falling back to pipe shell:", error);
    }

    const child = spawnProcess(shellPath, args, {
      cwd: workspaceDir,
      env,
      stdio: "pipe"
    });

    child.on("error", (error) => {
      console.error("[terminal] fallback shell failed:", error);
    });

    const cleanFallbackShellOutput = this.cleanFallbackShellOutput.bind(this);

    return {
      onData(callback: (data: string) => void) {
        child.stdout.on("data", (data) => {
          const output = cleanFallbackShellOutput(data.toString());
          if (output) {
            callback(output);
          }
        });
        child.stderr.on("data", (data) => {
          const output = cleanFallbackShellOutput(data.toString());
          if (output) {
            callback(output);
          }
        });
      },
      onExit(callback: () => void) {
        child.on("exit", callback);
        child.on("close", callback);
      },
      write(data: string) {
        child.stdin.write(data);
      },
      resize() {
        // Pipe fallback cannot resize like a PTY.
      },
      kill() {
        child.kill();
      },
      localEcho: true
    };
  }

  private formatLocalEcho(input: string) {
    let output = "";
    for (const char of input) {
      if (char === "\r" || char === "\n") {
        output += "\r\n";
      } else if (char === "\u007f" || char === "\b") {
        output += "\b \b";
      } else if (char === "\f") {
        output += "\x1b[2J\x1b[H";
      } else if (char >= " " || char === "\t") {
        output += char;
      }
    }
    return output;
  }

  private cleanFallbackShellOutput(output: string) {
    return output.replace(/\x1b\[\?1034h/g, "")
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed !== "bash: no job control in this shell" &&
          trimmed !== "The default interactive shell is now zsh." &&
          !trimmed.startsWith("To update your account to use zsh, please run") &&
          !trimmed.startsWith("For more details, please visit https://support.apple.com/kb/HT208050")
        );
      })
      .join("\r\n");
  }
}
