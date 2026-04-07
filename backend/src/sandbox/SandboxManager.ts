import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { Mission } from "../missions/types.js";
import { ensureDir } from "../utils/fs.js";
import { execCommand } from "../utils/exec.js";

export interface SandboxSession {
  id: string;
  missionId: string;
  createdAt: number;
  expiresAt: number;
  workspaceDir: string;
  mode: "docker-host" | "local-shell";
  commandLog: string[];
  commandBuffer: string;
  commandLogFile: string;
}

export class SandboxManager {
  private sessions = new Map<string, SandboxSession>();

  constructor() {
    ensureDir(env.sessionRoot);
    setInterval(() => this.cleanupExpiredSessions(), 60_000).unref();
  }

  async createSession(mission: Mission): Promise<SandboxSession> {
    const id = randomUUID();
    const workspaceDir = path.join(env.sessionRoot, id, "workspace");
    ensureDir(workspaceDir);
    for (const file of mission.initialState.workspaceFiles) {
      const target = path.join(workspaceDir, file.path);
      ensureDir(path.dirname(target));
      fs.writeFileSync(target, file.content, "utf8");
    }

    this.ensureCommonWorkspaceLayout(workspaceDir);

    const hasDocker = await this.hasDocker();
    const session: SandboxSession = {
      id,
      missionId: mission.id,
      createdAt: Date.now(),
      expiresAt: Date.now() + env.sessionTtlMinutes * 60_000,
      workspaceDir,
      mode: hasDocker ? "docker-host" : "local-shell",
      commandLog: [],
      commandBuffer: "",
      commandLogFile: path.join(workspaceDir, ".dockermissions_commands.log")
    };

    fs.writeFileSync(session.commandLogFile, "", "utf8");

    this.sessions.set(id, session);
    this.mountWorkspaceAlias(session);
    await this.seedInitialState(session, mission);
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
    fs.rmSync(path.dirname(session.workspaceDir), { recursive: true, force: true });
    return true;
  }

  touch(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.expiresAt = Date.now() + env.sessionTtlMinutes * 60_000;
    }
  }

  appendCommand(sessionId: string, input: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    for (const char of input) {
      if (char === "\r" || char === "\n") {
        const command = session.commandBuffer.trim();
        if (command) {
          session.commandLog.push(command);
          if (session.commandLog.length > 200) {
            session.commandLog.shift();
          }
        }
        session.commandBuffer = "";
        continue;
      }

      if (char === "\u007f" || char === "\b") {
        session.commandBuffer = session.commandBuffer.slice(0, -1);
        continue;
      }

      if (char >= " " || char === "\t") {
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

    const fileCommands = fs.existsSync(session.commandLogFile)
      ? fs
          .readFileSync(session.commandLogFile, "utf8")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];

    return [...session.commandLog, ...fileCommands];
  }

  private cleanupExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.destroySession(sessionId);
      }
    }
  }

  private async hasDocker() {
    const result = await execCommand("docker", ["version", "--format", "{{.Server.Version}}"]);
    return result.exitCode === 0;
  }

  private ensureCommonWorkspaceLayout(workspaceDir: string) {
    ensureDir(path.join(workspaceDir, "html"));
    ensureDir(path.join(workspaceDir, ".git"));
    ensureDir(path.join(workspaceDir, "node_modules"));
  }

  private mountWorkspaceAlias(session: SandboxSession) {
    for (const [aliasPath, target] of [
      ["/workspace", session.workspaceDir],
      ["/backup", path.join(session.workspaceDir, "backup")]
    ] as const) {
      try {
        ensureDir(path.dirname(target));
        if (fs.existsSync(aliasPath)) {
          fs.rmSync(aliasPath, { recursive: true, force: true });
        }
        fs.symlinkSync(target, aliasPath);
      } catch {
        // Ignore when the host/container filesystem does not allow a global alias.
      }
    }
  }

  private async dockerRun(args: string[], cwd: string) {
    await execCommand("docker", ["run", ...args], cwd);
  }

  private async dockerBuild(args: string[], cwd: string) {
    await execCommand("docker", ["build", ...args], cwd);
  }

  private async writeFile(workspaceDir: string, relativePath: string, content: string) {
    const target = path.join(workspaceDir, relativePath);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, content, "utf8");
  }

  private async seedInitialState(session: SandboxSession, mission: Mission) {
    const summary = mission.initialState.summary.toLowerCase();
    await this.seedWorkspaceArtifacts(session.workspaceDir, summary);
    if (summary.includes("host directory `/backup` exists and is writable")) {
      ensureDir(path.join(session.workspaceDir, "backup"));
    }

    if (session.mode !== "docker-host" || summary.includes("clean docker environment")) {
      return;
    }

    if (summary.includes("container `mission-agent`")) {
      await this.dockerRun(["-d", "--rm", "--name", "mission-agent", "alpine", "sleep", "3600"], session.workspaceDir);
    }
    if (summary.includes("container `old-service`")) {
      await this.dockerRun(["-d", "--rm", "--name", "old-service", "nginx"], session.workspaceDir);
    }
    if (summary.includes("container `debug-box`")) {
      await this.dockerRun(["-d", "--rm", "--name", "debug-box", "ubuntu:22.04", "sleep", "3600"], session.workspaceDir);
    }
    if (summary.includes("container `log-service`")) {
      await this.dockerRun(["-d", "--rm", "--name", "log-service", "alpine", "sh", "-lc", 'echo "SECRET_CODE=DOCKER42"; sleep 3600'], session.workspaceDir);
    }
    if (summary.includes("image `busybox:latest`")) {
      await execCommand("docker", ["pull", "busybox:latest"], session.workspaceDir);
    }
    if (summary.includes("network `mission-net`")) {
      await execCommand("docker", ["network", "create", "mission-net"], session.workspaceDir);
    }
    if (summary.includes("container `late-joiner`")) {
      await this.dockerRun(["-d", "--rm", "--name", "late-joiner", "alpine", "sleep", "3600"], session.workspaceDir);
    }
    if (summary.includes("volume `app-data` pre-created")) {
      await execCommand("docker", ["volume", "create", "app-data"], session.workspaceDir);
    }
    if (summary.includes("volume `app-data` exists with `/data/record.txt` containing `mission=complete`")) {
      await execCommand("docker", ["volume", "create", "app-data"], session.workspaceDir);
      await this.dockerRun(["--rm", "-v", "app-data:/data", "alpine", "sh", "-lc", "echo mission=complete > /data/record.txt"], session.workspaceDir);
    }
    if (summary.includes("volume `app-data` with files pre-created")) {
      await execCommand("docker", ["volume", "create", "app-data"], session.workspaceDir);
      await this.dockerRun(["--rm", "-v", "app-data:/data", "alpine", "sh", "-lc", "echo backup > /data/seed.txt"], session.workspaceDir);
    }
    if (summary.includes("`legacy-app:v1` pre-built")) {
      await this.dockerBuild(["-t", "legacy-app:v1", session.workspaceDir], session.workspaceDir);
    }
    if (summary.includes("`myapp:latest` image pre-built")) {
      await this.writeFile(session.workspaceDir, "Dockerfile", "FROM alpine:3.18\nCMD [\"sh\", \"-lc\", \"echo registry app\"]\n");
      await this.dockerBuild(["-t", "myapp:latest", session.workspaceDir], session.workspaceDir);
    }
    if (summary.includes("local registry running on port 5000")) {
      await this.dockerRun(["-d", "--rm", "--name", "registry", "-p", "5000:5000", "registry:2"], session.workspaceDir);
      await this.writeFile(session.workspaceDir, "Dockerfile", "FROM alpine:3.18\nCMD [\"sh\", \"-lc\", \"echo registry app\"]\n");
      await this.dockerBuild(["-t", "myapp:latest", session.workspaceDir], session.workspaceDir);
      await execCommand("docker", ["tag", "myapp:latest", "localhost:5000/myapp:v1"], session.workspaceDir);
    }
    if (summary.includes("many stopped containers, unused images, and dangling volumes pre-created")) {
      await this.dockerRun(["--name", "stopped-alpha", "alpine", "sh", "-lc", "echo done"], session.workspaceDir);
      await this.writeFile(session.workspaceDir, "Dockerfile", "FROM alpine:3.18\nRUN echo stale\n");
      await this.dockerBuild(["-t", "unused-image:latest", session.workspaceDir], session.workspaceDir);
      await execCommand("docker", ["volume", "create", "dangling-seed"], session.workspaceDir);
    }
  }

  private async seedWorkspaceArtifacts(workspaceDir: string, summary: string) {
    if (summary.includes("/workspace/html/index.html")) {
      await this.writeFile(workspaceDir, "html/index.html", "<h1>DockerMissions</h1>\n");
    }
    if (summary.includes("/workspace/default-seccomp.json")) {
      await this.writeFile(workspaceDir, "default-seccomp.json", '{ "defaultAction": "SCMP_ACT_ERRNO", "architectures": [], "syscalls": [] }\n');
    }
    if (summary.includes("`legacy-app:v1` pre-built")) {
      await this.writeFile(
        workspaceDir,
        "Dockerfile",
        ["FROM ubuntu:18.04", "RUN apt-get update", "RUN apt-get install -y curl", "RUN apt-get install -y wget", 'CMD ["bash", "-lc", "sleep 3600"]'].join("\n") + "\n"
      );
    }
    if (summary.includes("`myapp:v1` pre-built")) {
      await this.writeFile(
        workspaceDir,
        "Dockerfile",
        [
          "FROM ubuntu:22.04",
          "RUN apt-get update",
          "RUN apt-get install -y curl",
          "RUN apt-get install -y wget",
          "RUN apt-get install -y git",
          'CMD ["bash", "-lc", "echo mission ready"]'
        ].join("\n") + "\n"
      );
    }
    if (summary.includes("/workspace` with dockerfile and source files")) {
      await this.writeFile(workspaceDir, "Dockerfile", "FROM nginx:latest\nCOPY index.html /usr/share/nginx/html/index.html\n");
      await this.writeFile(workspaceDir, "index.html", "<h1>Cache me if you can</h1>\n");
    }
    if (summary.includes("/workspace/dockerfile` with plain `run apt-get install")) {
      await this.writeFile(workspaceDir, "Dockerfile", "FROM ubuntu:22.04\nRUN apt-get update && apt-get install -y curl\n");
    }
    if (summary.includes("nginx-based")) {
      await this.writeFile(workspaceDir, "Dockerfile", "FROM nginx:latest\nCOPY index.html /usr/share/nginx/html/index.html\n");
      await this.writeFile(workspaceDir, "index.html", "<h1>healthy nginx</h1>\n");
    }
  }
}
