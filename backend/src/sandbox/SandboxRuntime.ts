import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { ExecResult, execCommand } from "../utils/exec.js";

/**
 * Owns the single Docker-in-Docker sandbox container that every mission runs in.
 * The player's shell, mission setup and all validation commands execute inside it,
 * so nothing a mission does can touch the host's own containers, images or volumes.
 */
export class SandboxRuntime {
  readonly containerName = env.sandboxContainer;
  private startPromise: Promise<void> | null = null;
  private ready = false;

  /** Path of a session directory as seen from inside the sandbox. */
  sessionPathInSandbox(sessionId: string) {
    return `/sessions/${sessionId}`;
  }

  async hostDockerAvailable() {
    const result = await execCommand("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 10_000 });
    return result.exitCode === 0;
  }

  /** Make sure the sandbox image is built, the container is running and its inner engine answers. */
  ensureRunning(): Promise<void> {
    if (this.ready) {
      return this.verifyStillRunning();
    }
    if (!this.startPromise) {
      this.startPromise = this.start().finally(() => {
        this.startPromise = null;
      });
    }
    return this.startPromise;
  }

  private async verifyStillRunning() {
    const state = await execCommand("docker", ["inspect", "-f", "{{.State.Running}}", this.containerName], { timeoutMs: 10_000 });
    if (state.stdout.trim() === "true") {
      return;
    }
    this.ready = false;
    return this.ensureRunning();
  }

  private async start() {
    const imageHash = this.sandboxSourceHash();
    await this.ensureImage(imageHash);

    const inspect = await execCommand("docker", ["inspect", "-f", '{{.State.Running}}|{{index .Config.Labels "dockermissions.hash"}}', this.containerName], { timeoutMs: 10_000 });
    const [running, hash] = inspect.stdout.trim().split("|");
    const exists = inspect.exitCode === 0;

    if (exists && hash !== imageHash) {
      console.log("[sandbox] sandbox image changed; recreating container");
      await execCommand("docker", ["rm", "-f", this.containerName], { timeoutMs: 60_000 });
    }

    if (!exists || hash !== imageHash) {
      fs.mkdirSync(env.sessionRoot, { recursive: true });
      console.log("[sandbox] starting sandbox container");
      const run = await execCommand(
        "docker",
        [
          "run", "-d", "--privileged",
          "--name", this.containerName,
          "--hostname", "kestrel",
          "--label", `dockermissions.hash=${imageHash}`,
          "-v", `${env.sandboxCacheVolume}:/var/lib/docker`,
          "-v", `${env.sessionRootOnHost}:/sessions`,
          env.sandboxImage
        ],
        { timeoutMs: 120_000 }
      );
      if (run.exitCode !== 0) {
        throw new Error(`Could not start the sandbox container: ${run.stderr.trim()}`);
      }
    } else if (running !== "true") {
      await execCommand("docker", ["start", this.containerName], { timeoutMs: 60_000 });
    }

    await this.waitForInnerEngine();
    // Pull base images in the background so the first missions start quickly.
    await execCommand("docker", ["exec", "-d", "-w", "/", this.containerName, "dm-prefetch"], { timeoutMs: 10_000 });
    this.ready = true;
  }

  private async waitForInnerEngine() {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const info = await execCommand("docker", ["exec", "-w", "/", this.containerName, "docker", "info", "--format", "{{.ServerVersion}}"], { timeoutMs: 10_000 });
      if (info.exitCode === 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("The sandbox Docker engine did not become ready in time.");
  }

  private sandboxSourceHash() {
    const hash = crypto.createHash("sha256");
    const dir = env.sandboxBuildDir;
    for (const file of fs.readdirSync(dir).sort()) {
      hash.update(file);
      hash.update(fs.readFileSync(path.join(dir, file)));
    }
    return hash.digest("hex").slice(0, 16);
  }

  private async ensureImage(imageHash: string) {
    const inspect = await execCommand("docker", ["image", "inspect", "-f", '{{index .Config.Labels "dockermissions.hash"}}', env.sandboxImage], { timeoutMs: 10_000 });
    if (inspect.exitCode === 0 && inspect.stdout.trim() === imageHash) {
      return;
    }
    console.log("[sandbox] building sandbox image (first run can take a minute)");
    const build = await execCommand(
      "docker",
      ["build", "-t", env.sandboxImage, "--label", `dockermissions.hash=${imageHash}`, env.sandboxBuildDir],
      { timeoutMs: 600_000 }
    );
    if (build.exitCode !== 0) {
      throw new Error(`Could not build the sandbox image: ${build.stderr.trim().split("\n").slice(-5).join("\n")}`);
    }
  }

  /** Run a program inside the sandbox container. */
  exec(args: string[], options: { cwd?: string; timeoutMs?: number; input?: string } = {}): Promise<ExecResult> {
    const dockerArgs = ["exec"];
    if (options.input !== undefined) dockerArgs.push("-i");
    // Always set a cwd: /workspace is a symlink that dangles between sessions.
    dockerArgs.push("-w", options.cwd ?? "/");
    dockerArgs.push(this.containerName, ...args);
    return execCommand("docker", dockerArgs, { timeoutMs: options.timeoutMs ?? 30_000, input: options.input });
  }

  /** Run a bash command line inside the sandbox (cwd defaults to the active /workspace). */
  shell(command: string, options: { cwd?: string; timeoutMs?: number } = {}) {
    return this.exec(["bash", "-lc", command], { cwd: options.cwd ?? "/workspace", timeoutMs: options.timeoutMs ?? 30_000 });
  }

  /** Run a docker CLI command against the sandbox's inner engine. */
  docker(args: string[], timeoutMs = 30_000) {
    return this.exec(["docker", ...args], { timeoutMs });
  }

  async resetForSession(sessionId: string) {
    const reset = await this.exec(["dm-reset"], { timeoutMs: 180_000 });
    if (reset.exitCode !== 0) {
      console.error("[sandbox] dm-reset failed:", reset.stderr);
    }
    const workspace = `${this.sessionPathInSandbox(sessionId)}/workspace`;
    // /workspace inside the sandbox always points at the active session's workspace.
    const link = await this.exec(["sh", "-c", `rm -rf /workspace && ln -sfn '${workspace}' /workspace`], { timeoutMs: 10_000 });
    if (link.exitCode !== 0) {
      throw new Error(`Could not prepare /workspace: ${link.stderr}`);
    }
  }
}
