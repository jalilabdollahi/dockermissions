import fs from "node:fs";
import path from "node:path";
import { IncomingMessage } from "node:http";
import { URL } from "node:url";
import * as pty from "node-pty";
import { WebSocketServer } from "ws";
import { SandboxManager } from "../sandbox/SandboxManager.js";

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

      const shell = pty.spawn("bash", ["--noprofile", "--rcfile", rcFilePath, "-i"], {
        name: "xterm-256color",
        cols: cols,
        rows: rows,
        cwd: session.workspaceDir,
        env: {
          ...process.env as Record<string, string>,
          TERM: "xterm-256color"
        }
      });

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
}
