import fs from "node:fs";
import { CheckParamValue, Mission, ValidationCheck } from "../missions/types.js";
import { SandboxManager, SandboxSession } from "../sandbox/SandboxManager.js";
import { SandboxRuntime } from "../sandbox/SandboxRuntime.js";
import { analyzeCommands } from "./commandAnalysis.js";

export interface CheckResult {
  description: string;
  passed: boolean;
  /** Diagnostic detail for logs and the test harness (not shown to players). */
  detail?: string;
}

export interface ValidationResult {
  passed: boolean;
  checks: CheckResult[];
  failedChecks: string[];
  message: string;
  debrief?: string;
}

type Params = Record<string, CheckParamValue>;
type Outcome = { passed: boolean; detail?: string };

const pass = (detail?: string): Outcome => ({ passed: true, detail });
const fail = (detail?: string): Outcome => ({ passed: false, detail });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Single-quote a value for bash. */
function q(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function str(params: Params, key: string, fallback = "") {
  const value = params[key];
  return value === undefined || value === null ? fallback : String(value);
}

function has(params: Params, key: string) {
  return params[key] !== undefined && params[key] !== null && params[key] !== "";
}

function bool(value: CheckParamValue | undefined) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeRef(ref: string) {
  const lastSegment = ref.split("/").pop() ?? ref;
  return ref.includes("@") || lastSegment.includes(":") ? ref : `${ref}:latest`;
}

function stripDockerHubPrefix(ref: string) {
  return ref.replace(/^docker\.io\/library\//, "").replace(/^docker\.io\//, "");
}

/** Resolve a dot path; keys that themselves contain dots (labels like com.docker.compose.project) are supported. */
export function resolvePath(value: unknown, dotPath: string): unknown {
  if (!dotPath) return value;
  const parts = dotPath.split(".");
  const walk = (current: unknown, rest: string[]): unknown => {
    if (rest.length === 0) return current;
    if (current === null || typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    for (let i = rest.length; i >= 1; i--) {
      const key = rest.slice(0, i).join(".");
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        const found = walk(record[key], rest.slice(i));
        if (found !== undefined) return found;
      }
    }
    if (Array.isArray(current) && /^\d+$/.test(rest[0])) {
      return walk(current[Number(rest[0])], rest.slice(1));
    }
    return undefined;
  };
  return walk(value, parts);
}

function asComparable(value: unknown) {
  return value !== null && typeof value === "object" ? JSON.stringify(value) : String(value);
}

function containsValue(actual: unknown, expected: CheckParamValue) {
  if (actual === undefined || actual === null) return false;
  if (Array.isArray(actual)) {
    return actual.some((element) => asComparable(element) === String(expected));
  }
  if (typeof actual === "object") {
    return Object.prototype.hasOwnProperty.call(actual, String(expected));
  }
  return String(actual).includes(String(expected));
}

/** Shared comparison for *_inspect checks: equals / not_equals / contains / not_contains / exists. */
export function compareValue(actual: unknown, params: Params): Outcome {
  const shown = actual === undefined ? "<missing>" : asComparable(actual).slice(0, 200);
  const present = actual !== undefined && actual !== null;
  let compared = false;

  if (has(params, "exists")) {
    compared = true;
    if (present !== bool(params.exists)) return fail(`exists=${present}`);
  }
  if (has(params, "equals")) {
    compared = true;
    if (!present || asComparable(actual) !== String(params.equals)) return fail(`value ${shown}`);
  }
  if (has(params, "not_equals")) {
    compared = true;
    if (present && asComparable(actual) === String(params.not_equals)) return fail(`value ${shown}`);
  }
  if (has(params, "contains")) {
    compared = true;
    if (!containsValue(actual, params.contains)) return fail(`value ${shown}`);
  }
  if (has(params, "not_contains")) {
    compared = true;
    if (containsValue(actual, params.not_contains)) return fail(`value ${shown}`);
  }
  if (!compared && !present) return fail("value missing");
  return pass(`value ${shown}`);
}

function checkOutput(output: string, exitCode: number, params: Params, defaultExit = 0): Outcome {
  const expectedExit = has(params, "exit_code") ? Number(params.exit_code) : defaultExit;
  const trimmed = output.trim();
  const snippet = trimmed.slice(0, 300);
  if (exitCode !== expectedExit) return fail(`exit ${exitCode}, output: ${snippet}`);
  if (has(params, "output_equals") && trimmed !== str(params, "output_equals").trim()) return fail(`output: ${snippet}`);
  if (has(params, "output_contains") && !output.includes(str(params, "output_contains"))) return fail(`output: ${snippet}`);
  if (has(params, "output_not_contains") && output.includes(str(params, "output_not_contains"))) return fail(`output: ${snippet}`);
  return pass(`exit ${exitCode}`);
}

export class ValidationEngine {
  constructor(private runtime: SandboxRuntime, private sandboxManager: SandboxManager) {}

  async validate(session: SandboxSession, mission: Mission): Promise<ValidationResult> {
    try {
      await this.runtime.ensureRunning();
    } catch (error) {
      return {
        passed: false,
        checks: [],
        failedChecks: ["sandbox unavailable"],
        message: `The Docker sandbox is not running: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    const checks: CheckResult[] = [];
    for (const check of mission.validation) {
      let outcome: Outcome;
      try {
        outcome = await this.runCheck(session, check);
      } catch (error) {
        outcome = fail(error instanceof Error ? error.message : String(error));
      }
      checks.push({ description: check.description || check.type, passed: outcome.passed, detail: outcome.detail });
    }

    const failedChecks = checks.filter((check) => !check.passed).map((check) => check.description);
    if (failedChecks.length === 0) {
      return { passed: true, checks, failedChecks, message: "Mission complete.", debrief: mission.debrief };
    }

    const failedTypes = new Set(mission.validation.filter((_, index) => !checks[index].passed).map((check) => check.type));
    const tips = analyzeCommands(this.sandboxManager.getExecutedCommands(session.id), failedTypes);
    let message = tips.length > 0
      ? `Not there yet. A recent command looks off:\n\n${tips.join("\n\n")}`
      : `${failedChecks.length} of ${checks.length} requirement${checks.length === 1 ? "" : "s"} still open.`;
    if (session.setupErrors.length > 0) {
      message += "\n\n(Mission setup reported problems — try reselecting the mission to rebuild the sandbox.)";
    }
    return { passed: false, checks, failedChecks, message };
  }

  async runCheck(session: SandboxSession, check: ValidationCheck): Promise<Outcome> {
    const p = check.params ?? {};
    switch (check.type) {
      case "container_running": return this.containerRunning(p);
      case "container_exited": return this.containerExited(p);
      case "container_absent": return this.containerAbsent(p);
      case "container_inspect": return this.containerInspect(p);
      case "container_logs": return this.containerLogs(p);
      case "container_exec": return this.containerExec(p);
      case "image_exists": return this.imageExists(p, true);
      case "image_absent": return this.imageExists(p, false);
      case "image_inspect": return this.imageInspect(p);
      case "image_run": return this.imageRun(p);
      case "image_size_under": return this.imageSizeUnder(p);
      case "image_history": return this.imageHistory(p);
      case "network_exists": return this.networkExists(p);
      case "network_absent": return this.networkAbsent(p);
      case "network_inspect": return this.networkInspect(p);
      case "container_on_network": return this.containerOnNetwork(p, true);
      case "container_not_on_network": return this.containerOnNetwork(p, false);
      case "volume_exists": return this.volumeExists(p, true);
      case "volume_absent": return this.volumeExists(p, false);
      case "mount": return this.mount(session, p);
      case "http": return this.http(p);
      case "workspace_file": return this.workspaceFile(session, p);
      case "command_used": return this.commandUsed(session, p);
      case "compose_service": return this.composeService(p);
      case "health": return this.health(p);
      case "swarm_service": return this.swarmService(p);
      case "shell": return this.shell(p);
      default:
        return fail(`unknown check type "${check.type}"`);
    }
  }

  // ── inspect helpers ─────────────────────────────────────────────

  private async inspect(kind: "container" | "image" | "network" | "volume" | "service", name: string) {
    if (!name) return null;
    const args = kind === "container" ? ["inspect", "--type", "container", name] : [kind, "inspect", name];
    const result = await this.runtime.docker(args);
    if (result.exitCode !== 0) return null;
    try {
      const parsed = JSON.parse(result.stdout);
      return (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, any>;
    } catch {
      return null;
    }
  }

  // ── containers ──────────────────────────────────────────────────

  private async containerRunning(p: Params) {
    const container = await this.inspect("container", str(p, "name"));
    if (!container) return fail("container not found");
    if (!container.State?.Running) return fail(`state ${container.State?.Status}`);
    if (has(p, "image")) {
      const actual = stripDockerHubPrefix(String(container.Config?.Image ?? ""));
      const expected = stripDockerHubPrefix(str(p, "image"));
      if (actual !== expected && actual !== normalizeRef(expected) && normalizeRef(actual) !== expected) {
        return fail(`image ${actual}`);
      }
    }
    return pass();
  }

  private async containerExited(p: Params) {
    const container = await this.inspect("container", str(p, "name"));
    if (!container) return fail("container not found");
    if (container.State?.Running) return fail("still running");
    if (has(p, "exit_code") && Number(container.State?.ExitCode) !== Number(p.exit_code)) {
      return fail(`exit code ${container.State?.ExitCode}`);
    }
    return pass();
  }

  private async containerAbsent(p: Params) {
    const container = await this.inspect("container", str(p, "name"));
    return container ? fail("container still exists") : pass();
  }

  private async containerInspect(p: Params) {
    const container = await this.inspect("container", str(p, "name"));
    if (!container) return fail("container not found");
    return compareValue(resolvePath(container, str(p, "path")), p);
  }

  private async containerLogs(p: Params) {
    const result = await this.runtime.docker(["logs", str(p, "name")]);
    if (result.exitCode !== 0) return fail("cannot read logs");
    const logs = result.stdout + result.stderr;
    if (has(p, "contains") && !logs.includes(str(p, "contains"))) return fail("text not found in logs");
    if (has(p, "not_contains") && logs.includes(str(p, "not_contains"))) return fail("unwanted text found in logs");
    return pass();
  }

  private async containerExec(p: Params) {
    const result = await this.runtime.exec(["docker", "exec", str(p, "name"), "sh", "-c", str(p, "command")], { timeoutMs: 20_000 });
    return checkOutput(result.stdout + result.stderr, result.exitCode, p);
  }

  // ── images ──────────────────────────────────────────────────────

  private async imageExists(p: Params, shouldExist: boolean) {
    const ref = normalizeRef(str(p, "ref", str(p, "name")));
    const image = await this.inspect("image", ref);
    if (shouldExist) return image ? pass() : fail(`${ref} not found`);
    return image ? fail(`${ref} still exists`) : pass();
  }

  private async imageInspect(p: Params) {
    const image = await this.inspect("image", normalizeRef(str(p, "ref")));
    if (!image) return fail("image not found");
    return compareValue(resolvePath(image, str(p, "path")), p);
  }

  private async imageRun(p: Params) {
    const ref = normalizeRef(str(p, "ref"));
    if (!(await this.inspect("image", ref))) return fail("image not found");
    const entrypoint = has(p, "entrypoint") ? ` --entrypoint ${q(str(p, "entrypoint"))}` : "";
    const command = `docker run --rm${entrypoint} ${q(ref)} ${str(p, "args")}`;
    const result = await this.runtime.shell(command, { timeoutMs: 30_000 });
    return checkOutput(result.stdout + result.stderr, result.exitCode, p);
  }

  private async imageSizeUnder(p: Params) {
    const image = await this.inspect("image", normalizeRef(str(p, "ref")));
    if (!image) return fail("image not found");
    const sizeMb = Number(image.Size ?? 0) / 1_000_000;
    return sizeMb < Number(p.mb) ? pass(`${sizeMb.toFixed(1)} MB`) : fail(`${sizeMb.toFixed(1)} MB`);
  }

  private async imageHistory(p: Params) {
    const result = await this.runtime.docker(["history", "--no-trunc", "--format", "{{.CreatedBy}}", normalizeRef(str(p, "ref"))]);
    if (result.exitCode !== 0) return fail("image not found");
    const rows = result.stdout.split("\n").filter((line) => line.trim() !== "");
    if (has(p, "max_layers") && rows.length > Number(p.max_layers)) return fail(`${rows.length} history rows`);
    if (has(p, "not_contains") && rows.some((row) => row.includes(str(p, "not_contains")))) return fail("history contains forbidden text");
    return pass(`${rows.length} history rows`);
  }

  // ── networks ────────────────────────────────────────────────────

  private async networkExists(p: Params) {
    const network = await this.inspect("network", str(p, "name"));
    if (!network) return fail("network not found");
    if (has(p, "driver") && network.Driver !== str(p, "driver")) return fail(`driver ${network.Driver}`);
    if (has(p, "internal") && Boolean(network.Internal) !== bool(p.internal)) return fail(`internal ${network.Internal}`);
    if (has(p, "subnet")) {
      const subnets = (network.IPAM?.Config ?? []).map((config: Record<string, string>) => config.Subnet);
      if (!subnets.includes(str(p, "subnet"))) return fail(`subnets ${subnets.join(",")}`);
    }
    return pass();
  }

  private async networkAbsent(p: Params) {
    return (await this.inspect("network", str(p, "name"))) ? fail("network still exists") : pass();
  }

  private async networkInspect(p: Params) {
    const network = await this.inspect("network", str(p, "name"));
    if (!network) return fail("network not found");
    return compareValue(resolvePath(network, str(p, "path")), p);
  }

  private async containerOnNetwork(p: Params, shouldBeAttached: boolean) {
    const container = await this.inspect("container", str(p, "name"));
    if (!container) return fail("container not found");
    const endpoint = container.NetworkSettings?.Networks?.[str(p, "network")];
    if (!shouldBeAttached) return endpoint ? fail("still attached") : pass();
    if (!endpoint) return fail(`attached to ${Object.keys(container.NetworkSettings?.Networks ?? {}).join(", ") || "nothing"}`);
    if (has(p, "alias")) {
      const names = [...(endpoint.Aliases ?? []), ...(endpoint.DNSNames ?? [])];
      if (!names.includes(str(p, "alias"))) return fail(`aliases ${names.join(", ")}`);
    }
    if (has(p, "ip")) {
      const ips = [endpoint.IPAddress, endpoint.IPAMConfig?.IPv4Address].filter(Boolean);
      if (!ips.includes(str(p, "ip"))) return fail(`ip ${ips.join(", ")}`);
    }
    return pass();
  }

  // ── storage ─────────────────────────────────────────────────────

  private async volumeExists(p: Params, shouldExist: boolean) {
    const volume = await this.inspect("volume", str(p, "name"));
    if (shouldExist) return volume ? pass() : fail("volume not found");
    return volume ? fail("volume still exists") : pass();
  }

  private async mount(session: SandboxSession, p: Params) {
    const container = await this.inspect("container", str(p, "name"));
    if (!container) return fail("container not found");
    const mounts = (container.Mounts ?? []) as Array<Record<string, any>>;
    // `--tmpfs /path` mounts only show up in HostConfig.Tmpfs, not in .Mounts.
    for (const [tmpfsPath, options] of Object.entries((container.HostConfig?.Tmpfs ?? {}) as Record<string, string>)) {
      if (!mounts.some((entry) => entry.Destination === tmpfsPath)) {
        mounts.push({ Type: "tmpfs", Destination: tmpfsPath, RW: !/(^|,)ro(,|$)/.test(options), Source: "" });
      }
    }
    const destination = str(p, "destination");
    const mount = mounts.find((entry) => entry.Destination === destination);
    if (!mount) return fail(`no mount at ${destination}`);
    if (has(p, "type") && mount.Type !== str(p, "type")) return fail(`type ${mount.Type}`);
    if (has(p, "rw") && Boolean(mount.RW) !== bool(p.rw)) return fail(`rw ${mount.RW}`);
    if (has(p, "source")) {
      const expected = str(p, "source");
      if (mount.Type === "volume") {
        if (mount.Name !== expected) return fail(`volume ${mount.Name}`);
      } else {
        const workspaceInSandbox = `${this.runtime.sessionPathInSandbox(session.id)}/workspace`;
        const normalize = (value: string) =>
          value.replace(workspaceInSandbox, "/workspace").replace(/\/+$/, "").replace(/^(?!\/)/, "/workspace/");
        if (normalize(String(mount.Source ?? "")) !== normalize(expected)) return fail(`source ${mount.Source}`);
      }
    }
    return pass();
  }

  // ── network reachability ────────────────────────────────────────

  private async http(p: Params) {
    const url = str(p, "url");
    let last: Outcome = fail("not attempted");
    for (let attempt = 0; attempt < 5; attempt++) {
      last = has(p, "from") ? await this.httpFromContainer(p, url) : await this.httpFromSandbox(p, url);
      if (last.passed) return last;
      await sleep(1000);
    }
    return last;
  }

  private async httpFromSandbox(p: Params, url: string): Promise<Outcome> {
    const result = await this.runtime.exec(["curl", "-s", "--max-time", "4", "-w", "\n__DM_STATUS__%{http_code}", url], { timeoutMs: 10_000 });
    const marker = result.stdout.lastIndexOf("\n__DM_STATUS__");
    const body = marker >= 0 ? result.stdout.slice(0, marker) : result.stdout;
    const status = marker >= 0 ? result.stdout.slice(marker + "\n__DM_STATUS__".length).trim() : "000";
    const expectedStatus = str(p, "status", "200");
    if (status !== expectedStatus) return fail(`HTTP ${status}`);
    if (has(p, "body_contains") && !body.includes(str(p, "body_contains"))) return fail("body does not contain expected text");
    return pass(`HTTP ${status}`);
  }

  private async httpFromContainer(p: Params, url: string): Promise<Outcome> {
    const result = await this.runtime.exec(["docker", "exec", str(p, "from"), "wget", "-qO-", "-T", "4", url], { timeoutMs: 10_000 });
    if (result.exitCode !== 0) return fail(`wget exit ${result.exitCode}: ${result.stderr.trim().slice(0, 200)}`);
    if (has(p, "body_contains") && !result.stdout.includes(str(p, "body_contains"))) return fail("body does not contain expected text");
    return pass();
  }

  // ── workspace & commands ────────────────────────────────────────

  private async workspaceFile(session: SandboxSession, p: Params) {
    const filePath = this.sandboxManager.resolveWorkspacePath(session, str(p, "path"));
    const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    const shouldExist = has(p, "exists") ? bool(p.exists) : true;
    if (!shouldExist) return exists ? fail("file exists") : pass();
    if (!exists) return fail("file not found");
    const content = fs.readFileSync(filePath, "utf8");
    if (has(p, "contains") && !content.includes(str(p, "contains"))) return fail("expected text missing");
    if (has(p, "not_contains") && content.includes(str(p, "not_contains"))) return fail("forbidden text present");
    if (has(p, "matches") && !new RegExp(str(p, "matches"), "m").test(content)) return fail("pattern not matched");
    return pass();
  }

  private async commandUsed(session: SandboxSession, p: Params) {
    const pattern = new RegExp(str(p, "pattern"));
    const commands = this.sandboxManager.getExecutedCommands(session.id);
    return commands.some((command) => pattern.test(command)) ? pass() : fail("no matching command typed");
  }

  // ── compose, health, swarm ──────────────────────────────────────

  private async composeService(p: Params) {
    const result = await this.runtime.docker([
      "ps",
      "--filter", `label=com.docker.compose.project=${str(p, "project")}`,
      "--filter", `label=com.docker.compose.service=${str(p, "service")}`,
      "--format", "{{.Names}}"
    ]);
    if (result.exitCode !== 0) return fail("docker ps failed");
    const running = result.stdout.split("\n").filter((line) => line.trim() !== "").length;
    if (has(p, "count")) return running === Number(p.count) ? pass(`${running} running`) : fail(`${running} running`);
    if (has(p, "running") && !bool(p.running) && Number(p.running) === 0) {
      return running === 0 ? pass() : fail(`${running} running`);
    }
    const minimum = has(p, "running") && Number(p.running) > 1 ? Number(p.running) : 1;
    return running >= minimum ? pass(`${running} running`) : fail(`${running} running`);
  }

  private async health(p: Params) {
    const expected = str(p, "status", "healthy");
    let status = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const container = await this.inspect("container", str(p, "name"));
      if (!container) return fail("container not found");
      status = String(container.State?.Health?.Status ?? "none");
      if (status === expected) return pass();
      if (status !== "starting") break;
      await sleep(1500);
    }
    return fail(`health ${status}`);
  }

  private async swarmService(p: Params) {
    const service = await this.inspect("service", str(p, "name"));
    if (!service) return fail("service not found");
    if (has(p, "replicas")) {
      const replicas = service.Spec?.Mode?.Replicated?.Replicas;
      if (Number(replicas) !== Number(p.replicas)) return fail(`replicas ${replicas}`);
    }
    if (has(p, "image_contains")) {
      const image = String(service.Spec?.TaskTemplate?.ContainerSpec?.Image ?? "");
      if (!image.includes(str(p, "image_contains"))) return fail(`image ${image.split("@")[0]}`);
    }
    if (has(p, "running")) {
      let running = 0;
      for (let attempt = 0; attempt < 10; attempt++) {
        const tasks = await this.runtime.docker(["service", "ps", str(p, "name"), "--filter", "desired-state=running", "--format", "{{.CurrentState}}"]);
        running = tasks.stdout.split("\n").filter((line) => line.startsWith("Running")).length;
        if (running >= Number(p.running)) return pass(`${running} running`);
        await sleep(1500);
      }
      return fail(`${running} running tasks`);
    }
    return pass();
  }

  private async shell(p: Params) {
    const result = await this.runtime.shell(str(p, "command"), { timeoutMs: 20_000 });
    if (has(p, "output_equals")) {
      return checkOutput(result.stdout, result.exitCode, p);
    }
    return checkOutput(result.stdout + result.stderr, result.exitCode, p);
  }
}
