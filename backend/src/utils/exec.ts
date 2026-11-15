import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut?: boolean;
}

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  input?: string;
}

export function execCommand(command: string, args: string[], options: ExecOptions | string = {}): Promise<ExecResult> {
  const opts: ExecOptions = typeof options === "string" ? { cwd: options } : options;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    if (opts.input !== undefined && child.stdin) {
      child.stdin.end(opts.input);
    }
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout: "", stderr: error.message, exitCode: 127 });
    });
    child.on("close", (exitCode) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: timedOut ? 124 : (exitCode ?? 1), timedOut });
    });
  });
}
