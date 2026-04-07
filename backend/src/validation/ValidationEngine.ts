import fs from "node:fs";
import path from "node:path";
import { Mission, ValidationCheck } from "../missions/types.js";
import { SandboxSession } from "../sandbox/SandboxManager.js";
import { execCommand } from "../utils/exec.js";

export interface ValidationResult {
  passed: boolean;
  failedChecks: string[];
  message: string;
}

function tryParseFirst(json: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
  } catch {
    return null;
  }
}

async function inspectContainer(name: string) {
  const result = await execCommand("docker", ["inspect", name]);
  if (result.exitCode !== 0) return null;
  return tryParseFirst(result.stdout);
}

async function inspectImage(name: string) {
  const result = await execCommand("docker", ["image", "inspect", name]);
  if (result.exitCode !== 0) return null;
  return tryParseFirst(result.stdout);
}

async function inspectNetwork(name: string) {
  const result = await execCommand("docker", ["network", "inspect", name]);
  if (result.exitCode !== 0) return null;
  return tryParseFirst(result.stdout);
}

async function listContainers(all = true) {
  const args = ["ps", "--format", "{{.Names}}"];
  if (all) {
    args.splice(1, 0, "-a");
  }
  const result = await execCommand("docker", args);
  if (result.exitCode !== 0) {
    return [];
  }
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function wildcardToRegExp(input: string) {
  const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function fileForWorkspace(session: SandboxSession, rawPath: string) {
  return path.join(session.workspaceDir, rawPath.replace(/^\/workspace\/?/, ""));
}

// Flags that belong to `docker run` itself (before the image name)
const DOCKER_RUN_FLAGS = new Set([
  "--name", "-e", "--env", "-p", "--publish", "-v", "--volume",
  "--network", "--net", "-d", "--detach", "-it", "-i", "-t",
  "--rm", "--user", "-u", "--memory", "-m", "--cpus", "--read-only",
  "--tmpfs", "--init", "--cap-add", "--cap-drop", "--security-opt",
  "--entrypoint", "--workdir", "-w", "--label", "-l", "--hostname",
  "--restart", "--env-file", "--link", "--privileged", "--pid",
  "--mount", "--platform"
]);

function analyzeCommands(commandLog: string[]): string[] {
  const hints: string[] = [];

  for (const raw of commandLog.slice(-20)) {
    const cmd = raw.trim();

    // ── docker run analysis ──────────────────────────────────────
    if (/^docker\s+run\b/.test(cmd)) {
      const tokens: string[] = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
      // tokens[0]="docker" tokens[1]="run"
      const imageIndex = findImageIndex(tokens);
      if (imageIndex !== -1) {
        // Check for docker flags placed after the image
        const afterImage = tokens.slice(imageIndex + 1);
        const misplacedFlags = afterImage.filter((t) => DOCKER_RUN_FLAGS.has(t.replace(/=.*$/, "")));
        if (misplacedFlags.length > 0) {
          hints.push(
            `Flags after the image name are passed to the container, not Docker.` +
            `\n  You wrote:  ${cmd}` +
            `\n  Move ${misplacedFlags.join(", ")} before the image name.` +
            `\n  Example:    docker run ${tokens.slice(2, imageIndex).join(" ")} ${misplacedFlags.join(" ")} ${tokens[imageIndex]}`
          );
        }

        // Check -p / --publish format issues
        const portFlagIdx = tokens.findIndex((t) => t === "-p" || t === "--publish");
        if (portFlagIdx !== -1 && portFlagIdx < imageIndex) {
          const portVal = tokens[portFlagIdx + 1] ?? "";
          if (portVal && !/^\d+:\d+$/.test(portVal.replace(/^-p=/, ""))) {
            hints.push(
              `Port mapping format should be  -p HOST:CONTAINER  (e.g.  -p 8080:80).` +
              `\n  Got: ${portVal}`
            );
          }
        }

        // Check missing -d when container exits immediately
        const hasDetach = tokens.includes("-d") || tokens.includes("--detach");
        if (!hasDetach) {
          hints.push(
            `Missing  -d  flag — without it the container runs in the foreground and blocks.` +
            `\n  Add  -d  after  docker run  to detach.`
          );
        }
      }
    }

    // ── docker exec analysis ─────────────────────────────────────
    if (/^docker\s+exec\b/.test(cmd) && !/\s-it?\b|-ti?\b/.test(cmd) && /\bbash\b|\bsh\b/.test(cmd)) {
      hints.push(
        `Opening an interactive shell with  docker exec  requires  -it  flags.` +
        `\n  Try:  ${cmd.replace("docker exec ", "docker exec -it ")}`
      );
    }

    // ── docker build missing -t ──────────────────────────────────
    if (/^docker\s+build\b/.test(cmd) && !/-t\b|--tag\b/.test(cmd)) {
      hints.push(
        `docker build  without  -t  creates an untagged image that's hard to reference.` +
        `\n  Add  -t yourimage:tag  to name the image.`
      );
    }
  }

  return [...new Set(hints)]; // deduplicate
}

/** Find the index of the image token in a docker run command (first non-flag positional after "run"). */
function findImageIndex(tokens: string[]): number {
  let i = 2; // skip "docker" "run"
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.startsWith("-")) {
      // Skip value of flags that take an argument
      if (DOCKER_RUN_FLAGS.has(t) && !t.includes("=") &&
          !["--rm", "-d", "--detach", "-i", "-t", "-it", "-ti",
            "--read-only", "--init", "--privileged"].includes(t)) {
        i += 2; // flag + value
      } else {
        i += 1; // boolean flag
      }
    } else {
      return i; // this token is the image
    }
  }
  return -1;
}

export class ValidationEngine {
  async validate(session: SandboxSession, mission: Mission): Promise<ValidationResult> {
    if (session.mode !== "docker-host") {
      return {
        passed: false,
        failedChecks: ["docker unavailable"],
        message: "Docker is not available on the host, so runtime validation is disabled in this environment."
      };
    }

    const failedChecks: string[] = [];
    for (const check of mission.validation) {
      const passed = await this.runCheck(session, mission, check);
      if (!passed) {
        failedChecks.push(check.description || check.type);
      }
    }

    if (failedChecks.length > 0) {
      const hints = analyzeCommands(session.commandLog);
      return {
        passed: false,
        failedChecks,
        message: hints.length > 0
          ? `Command issue detected:\n${hints.join("\n")}`
          : "Some objectives still need work."
      };
    }

    return { passed: true, failedChecks: [], message: "Mission complete." };
  }

  private async runCheck(session: SandboxSession, mission: Mission, check: ValidationCheck) {
    switch (check.type) {
      case "container_running":
        return this.containerRunning(check);
      case "container_not_exists":
        return this.containerNotExists(check);
      case "container_stopped":
        return this.containerStopped(check);
      case "image_exists":
        return this.imageExists(check);
      case "image_not_exists":
        return this.imageNotExists(check);
      case "image_label":
        return this.imageLabel(check);
      case "port_exposed":
        return this.portExposed(check);
      case "env_var_set":
        return this.envVarSet(check);
      case "network_exists":
        return this.networkExists(check);
      case "container_on_network":
        return this.containerOnNetwork(check);
      case "container_network_mode":
        return this.containerNetworkMode(check);
      case "file_in_container":
        return this.fileInContainer(check);
      case "file_exists":
        return this.fileExists(session, check);
      case "command_run":
        return this.commandRun(session, check);
      case "http_responds":
        return this.httpResponds(check);
      case "volume_exists":
        return this.volumeExists(check);
      case "volume_mounted":
        return this.volumeMounted(check);
      case "ping_succeeds":
        return this.pingSucceeds(check);
      case "dockerignore_excludes":
        return this.dockerignoreExcludes(session, check);
      case "file_content":
        return this.fileContent(check);
      case "file_exists_on_host":
        return this.fileExistsOnHost(session, check);
      case "tar_valid":
        return this.tarValid(session, check);
      case "bind_mount":
        return this.bindMount(session, check);
      case "tmpfs_mounted":
        return this.tmpfsMounted(check);
      case "no_root":
        return this.noRoot(check);
      case "readonly_rootfs":
        return this.readonlyRootfs(check);
      case "cap_dropped_all":
        return this.capDroppedAll(check);
      case "cap_added":
        return this.capAdded(check);
      case "seccomp_applied":
        return this.seccompApplied(check);
      case "memory_limit":
        return this.memoryLimit(check);
      case "cpu_limit":
        return this.cpuLimit(check);
      case "image_in_registry":
        return this.imageInRegistry(check);
      case "container_ran":
        return this.containerRan(session, check);
      case "Container runs successfully":
        return this.containerRunsSuccessfully(session, mission);
      case "fewer_layers":
        return this.fewerLayers(check);
      case "build_used_cache":
        return this.buildUsedCache(session, check);
      case "dockerfile_uses_cache_mount":
        return this.dockerfileUsesCacheMount(session, check);
      case "uses_init":
        return this.usesInit(check);
      case "context_exists":
        return this.contextExists(check);
      case "context_host":
        return this.contextHost(check);
      case "dockerfile_has_healthcheck":
        return this.dockerfileHasHealthcheck(session, check);
      case "container_health_healthy":
        return this.containerHealthHealthy(check);
      case "swarm_active":
        return this.swarmActive(check);
      case "swarm_service_running":
        return this.swarmServiceRunning(check);
      case "no_stopped_containers":
        return this.noStoppedContainers();
      case "no_dangling_images":
        return this.noDanglingImages();
      case "no_unused_volumes":
        return this.noUnusedVolumes();
      case "service_on_network":
        return this.serviceOnNetwork(check, true);
      case "service_not_on_network":
        return this.serviceOnNetwork(check, false);
      case "service_has_healthcheck":
        return this.serviceHasHealthcheck(check);
      case "depends_on_healthy":
        return this.dependsOnHealthy(session, check);
      case "scan_critical_cves_zero":
        return this.scanCriticalCvesZero(session, check);
      case "file_in_image":
      case "binary_in_image":
      case "env_var_in_image":
      case "workdir_in_image":
      case "image_size_under":
      case "compose_service_running":
      case "service_replicas":
      case "no_external_network":
        return this.bestEffortDockerCheck(check);
      default:
        return false;
    }
  }

  private async containerRunning(check: ValidationCheck) {
    const target = String(check.params.name ?? "");
    const image = String(check.params.image ?? "");
    const result = await execCommand("docker", ["ps", "--format", "{{.Names}}|{{.Image}}"]);
    if (result.exitCode !== 0) {
      return false;
    }
    const nameRegex = target.includes("*") ? wildcardToRegExp(target) : null;
    return result.stdout.split("\n").some((line) => {
      const parts = line.split("|");
      if (parts.length < 2) return false;
      const [nameValue, imageValue] = parts;
      const nameOk = target ? (nameRegex ? nameRegex.test(nameValue) : nameValue === target) : true;
      const imageOk = image ? (imageValue ?? "").startsWith(image) : true;
      return nameOk && imageOk;
    });
  }

  private async containerNotExists(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.name));
    return !container;
  }

  private async containerStopped(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.name));
    return Boolean(container) && !container?.State?.Running;
  }

  private async imageExists(check: ValidationCheck) {
    const name = String(check.params.name ?? check.params.image ?? "");
    const tag = String(check.params.tag ?? "latest");
    return Boolean(await inspectImage(`${name}:${tag}`));
  }

  private async imageNotExists(check: ValidationCheck) {
    const name = String(check.params.name ?? "");
    const tag = String(check.params.tag ?? "latest");
    return !(await inspectImage(`${name}:${tag}`));
  }

  private async imageLabel(check: ValidationCheck) {
    const imageName = String(check.params.image ?? `${check.params.name}:${check.params.tag ?? "latest"}`);
    const image = await inspectImage(imageName);
    const key = String(check.params.key ?? "");
    const value = String(check.params.value ?? "");
    return image?.Config?.Labels?.[key] === value;
  }

  private async portExposed(check: ValidationCheck) {
    const containerName = await this.resolveContainerName(String(check.params.container ?? check.params.service));
    const container = containerName ? await inspectContainer(containerName) : null;
    const hostPort = String(check.params.host_port ?? "");
    const containerPort = `${String(check.params.container_port ?? "")}/tcp`;
    const ports = container?.NetworkSettings?.Ports ?? {};
    const binding = ports[containerPort]?.[0];
    return binding?.HostPort === hostPort;
  }

  private async envVarSet(check: ValidationCheck) {
    const containerName = String(check.params.container ?? "");
    if (containerName.includes("*")) {
      const regex = wildcardToRegExp(containerName);
      const names = await listContainers(true);
      for (const name of names.filter((value) => regex.test(value))) {
        const container = await inspectContainer(name);
        const envVars = container?.Config?.Env ?? [];
        if (envVars.includes(`${String(check.params.key ?? "")}=${String(check.params.value ?? "")}`)) {
          return true;
        }
      }
      return false;
    }
    const container = await inspectContainer(containerName);
    const key = String(check.params.key ?? "");
    const value = String(check.params.value ?? "");
    const envVars = container?.Config?.Env ?? [];
    return envVars.includes(`${key}=${value}`);
  }

  private async networkExists(check: ValidationCheck) {
    const networkName = String(check.params.name ?? check.params.network);
    if (networkName.includes("*")) {
      const result = await execCommand("docker", ["network", "ls", "--format", "{{.Name}}|{{.Driver}}"]);
      if (result.exitCode !== 0) {
        return false;
      }
      const regex = wildcardToRegExp(networkName);
      return result.stdout.split("\n").some((line) => {
        const [name, driver] = line.split("|");
        return regex.test(name) && (!check.params.driver || driver === String(check.params.driver));
      });
    }
    const network = await inspectNetwork(networkName);
    const driver = check.params.driver ? String(check.params.driver) : null;
    return Boolean(network) && (!driver || network?.Driver === driver);
  }

  private async containerOnNetwork(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    return Boolean(container?.NetworkSettings?.Networks?.[String(check.params.network)]);
  }

  private async containerNetworkMode(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    return container?.HostConfig?.NetworkMode === String(check.params.mode);
  }

  private async fileInContainer(check: ValidationCheck) {
    const result = await execCommand("docker", [
      "exec",
      String(check.params.container),
      "sh",
      "-lc",
      `test -f ${String(check.params.path)}`
    ]);
    return result.exitCode === 0;
  }

  private async fileExists(session: SandboxSession, check: ValidationCheck) {
    const targetPath = fileForWorkspace(session, String(check.params.path));
    return fs.existsSync(targetPath);
  }

  private async commandRun(session: SandboxSession, check: ValidationCheck) {
    const pattern = String(check.params.command ?? check.description).replace(/ executed$/i, "").trim();
    const executedCommands = this.getExecutedCommands(session);
    return executedCommands.some((command) => command.includes(pattern));
  }

  private async httpResponds(check: ValidationCheck) {
    const body = await execCommand("curl", ["-s", String(check.params.url)]);
    if (body.exitCode !== 0) {
      return false;
    }

    const requiredStatus = check.params.status ? String(check.params.status) : null;
    if (requiredStatus) {
      const statusResult = await execCommand("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", String(check.params.url)]);
      if (statusResult.stdout.trim() !== requiredStatus) {
        return false;
      }
    }

    const bodyContains = check.params.body_contains ? String(check.params.body_contains) : null;
    return bodyContains ? body.stdout.includes(bodyContains) : true;
  }

  private async volumeExists(check: ValidationCheck) {
    const name = String(check.params.name ?? "");
    if (name.includes("*")) {
      const result = await execCommand("docker", ["volume", "ls", "--format", "{{.Name}}"]);
      if (result.exitCode !== 0) {
        return false;
      }
      const regex = wildcardToRegExp(name);
      return result.stdout.split("\n").some((entry) => regex.test(entry));
    }
    const result = await execCommand("docker", ["volume", "inspect", name]);
    return result.exitCode === 0;
  }

  private async volumeMounted(check: ValidationCheck) {
    const containerName = await this.resolveContainerName(String(check.params.container ?? check.params.service ?? ""));
    const container = containerName ? await inspectContainer(containerName) : null;
    const pathValue = String(check.params.path ?? "");
    const volumeHint = String(check.params.volume ?? "");
    const mounts = container?.Mounts ?? [];
    return mounts.some((mount: Record<string, any>) => {
      const destinationOk = mount.Destination === pathValue;
      const volumeOk = volumeHint ? String(mount.Name ?? "").includes(volumeHint.replace(/\*/g, "")) : true;
      return destinationOk && volumeOk;
    });
  }

  private async pingSucceeds(check: ValidationCheck) {
    const result = await execCommand("docker", [
      "exec",
      String(check.params.from),
      "sh",
      "-lc",
      `ping -c 1 ${String(check.params.to)}`
    ]);
    return result.exitCode === 0;
  }

  private async dockerignoreExcludes(session: SandboxSession, check: ValidationCheck) {
    const dockerignorePath = path.join(session.workspaceDir, ".dockerignore");
    if (!fs.existsSync(dockerignorePath)) {
      return false;
    }
    const contents = fs.readFileSync(dockerignorePath, "utf8");
    const entries = String(check.params.entries ?? "")
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return entries.every((entry) => contents.includes(entry));
  }

  private async bestEffortDockerCheck(check: ValidationCheck) {
    if (check.type === "image_size_under") {
      const image = await inspectImage(String(check.params.image));
      const maxMb = Number(check.params.max_mb ?? 0);
      return image ? image.Size / (1024 * 1024) < maxMb : false;
    }

    if (check.type === "compose_service_running") {
      const service = String(check.params.service ?? "");
      const names = await listContainers(true);
      return names.some((name) => name.includes(`-${service}-`) || name.includes(`_${service}_`));
    }

    if (check.type === "service_replicas") {
      const service = String(check.params.service ?? "");
      const count = Number(check.params.count ?? 0);
      const names = await listContainers(true);
      const matches = names.filter((name) => name.includes(`-${service}-`) || name.includes(`_${service}_`));
      return matches.length === count;
    }

    if (check.type === "file_in_image") {
      const image = String(check.params.image ?? "");
      const filePath = String(check.params.path ?? "");
      const result = await execCommand("docker", ["run", "--rm", image, "sh", "-lc", `test -f ${filePath}`]);
      return result.exitCode === 0;
    }

    if (check.type === "binary_in_image") {
      const image = String(check.params.image ?? "");
      const binary = String(check.params.binary ?? "");
      const result = await execCommand("docker", ["run", "--rm", image, "sh", "-lc", `command -v ${binary}`]);
      return result.exitCode === 0;
    }

    if (check.type === "env_var_in_image") {
      const image = await inspectImage(String(check.params.image ?? ""));
      const key = String(check.params.key ?? "");
      const value = String(check.params.value ?? "");
      return (image?.Config?.Env ?? []).includes(`${key}=${value}`);
    }

    if (check.type === "workdir_in_image") {
      const image = await inspectImage(String(check.params.image ?? ""));
      return image?.Config?.WorkingDir === String(check.params.path ?? "");
    }

    if (check.type === "no_external_network") {
      const container = await inspectContainer(String(check.params.container ?? ""));
      const networks = Object.keys(container?.NetworkSettings?.Networks ?? {});
      return container?.HostConfig?.NetworkMode === "none" || (networks.length === 0);
    }

    return false;
  }

  private async resolveContainerName(hint: string) {
    if (!hint) {
      return null;
    }
    const names = await listContainers(true);
    if (!hint.includes("*")) {
      if (names.includes(hint)) {
        return hint;
      }
      return names.find((name) => name.includes(`-${hint}-`) || name.includes(`_${hint}_`) || name.endsWith(`-${hint}-1`) || name.endsWith(`_${hint}_1`)) ?? null;
    }
    const regex = wildcardToRegExp(hint);
    return names.find((name) => regex.test(name)) ?? null;
  }

  private async fileContent(check: ValidationCheck) {
    const result = await execCommand("docker", [
      "exec",
      String(check.params.container),
      "sh",
      "-lc",
      `cat ${String(check.params.path)}`
    ]);
    return result.exitCode === 0 && result.stdout.includes(String(check.params.contains ?? ""));
  }

  private async fileExistsOnHost(session: SandboxSession, check: ValidationCheck) {
    const rawPath = String(check.params.path ?? "");
    const mappedPath = rawPath.startsWith("/backup/") ? path.join(session.workspaceDir, rawPath.replace(/^\/backup\/?/, "backup/")) : rawPath;
    return fs.existsSync(mappedPath);
  }

  private async tarValid(session: SandboxSession, check: ValidationCheck) {
    const rawPath = String(check.params.path ?? "");
    const mappedPath = rawPath.startsWith("/backup/") ? path.join(session.workspaceDir, rawPath.replace(/^\/backup\/?/, "backup/")) : rawPath;
    const result = await execCommand("tar", ["tzf", mappedPath]);
    return result.exitCode === 0;
  }

  private async bindMount(session: SandboxSession, check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    const expectedSource = String(check.params.host_path).startsWith("/workspace")
      ? fileForWorkspace(session, String(check.params.host_path))
      : String(check.params.host_path);
    const expectedDestination = String(check.params.container_path);
    const rawSource = String(check.params.host_path);
    return (container?.Mounts ?? []).some(
      (mount: Record<string, any>) =>
        mount.Type === "bind" &&
        mount.Destination === expectedDestination &&
        (mount.Source === expectedSource || mount.Source === rawSource)
    );
  }

  private async tmpfsMounted(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    return (container?.HostConfig?.Tmpfs && String(check.params.path) in container.HostConfig.Tmpfs) || (container?.Mounts ?? []).some((mount: Record<string, any>) => mount.Type === "tmpfs" && mount.Destination === String(check.params.path));
  }

  private async noRoot(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    const user = String(container?.Config?.User ?? "");
    return user !== "" && user !== "0" && user !== "root";
  }

  private async readonlyRootfs(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    return container?.HostConfig?.ReadonlyRootfs === true;
  }

  private async capDroppedAll(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    const caps = container?.HostConfig?.CapDrop ?? [];
    return caps.includes("ALL");
  }

  private async capAdded(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    const caps = container?.HostConfig?.CapAdd ?? [];
    return caps.includes(String(check.params.cap));
  }

  private async seccompApplied(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    const securityOpt = container?.HostConfig?.SecurityOpt ?? [];
    return securityOpt.some((value: string) => value.startsWith("seccomp="));
  }

  private async memoryLimit(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    return Number(container?.HostConfig?.Memory ?? 0) === Number(check.params.limit ?? 0);
  }

  private async cpuLimit(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    const expected = Number(check.params.cpus ?? 0);
    const nanoCpus = Number(container?.HostConfig?.NanoCpus ?? 0);
    return nanoCpus === expected * 1_000_000_000;
  }

  private async imageInRegistry(check: ValidationCheck) {
    const url = `http://${String(check.params.registry)}/v2/${String(check.params.name)}/manifests/${String(check.params.tag)}`;
    const result = await execCommand("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-H", "Accept: application/vnd.docker.distribution.manifest.v2+json", url]);
    return result.stdout.trim() === "200";
  }

  private async containerRan(session: SandboxSession, check: ValidationCheck) {
    const image = String(check.params.image ?? "");
    const executedCommands = this.getExecutedCommands(session);
    return executedCommands.some((command) => command.includes("docker run") && command.includes(image));
  }

  private async containerRunsSuccessfully(session: SandboxSession, mission: Mission) {
    const imageCheck = mission.validation.find((check) => check.type === "image_exists");
    const imageName = imageCheck ? `${String(imageCheck.params.name)}:${String(imageCheck.params.tag ?? "latest")}` : "";
    const executedCommands = this.getExecutedCommands(session);
    return imageName ? executedCommands.some((command) => command.includes("docker run") && command.includes(imageName)) : false;
  }

  private async fewerLayers(check: ValidationCheck) {
    const inspectHistory = async (image: string) => {
      const result = await execCommand("docker", ["history", image, "--format", "{{.CreatedBy}}"]);
      return result.exitCode === 0 ? result.stdout.split("\n").filter(Boolean).length : Number.MAX_SAFE_INTEGER;
    };
    const a = await inspectHistory(String(check.params.image_a));
    const b = await inspectHistory(String(check.params.image_b));
    return a < b;
  }

  private async buildUsedCache(session: SandboxSession, check: ValidationCheck) {
    const image = String(check.params.image ?? "");
    const executedCommands = this.getExecutedCommands(session);
    const builtTwice = executedCommands.filter((command) => command.includes("docker build") && command.includes("cached-app:")).length >= 2;
    const usedBuildKit = executedCommands.some((command) => command.includes("DOCKER_BUILDKIT=1"));
    const imageExists = await inspectImage(image);
    return Boolean(imageExists) && builtTwice && usedBuildKit;
  }

  private getExecutedCommands(session: SandboxSession) {
    return Array.from(new Set([...session.commandLog, ...fs
      .readFileSync(session.commandLogFile, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)]));
  }

  private async dockerfileUsesCacheMount(session: SandboxSession, check: ValidationCheck) {
    const dockerfilePath = fileForWorkspace(session, String(check.params.path ?? "/workspace/Dockerfile"));
    return fs.existsSync(dockerfilePath) && fs.readFileSync(dockerfilePath, "utf8").includes("--mount=type=cache");
  }

  private async usesInit(check: ValidationCheck) {
    const container = await inspectContainer(String(check.params.container));
    return Boolean(container?.HostConfig?.Init);
  }

  private async contextExists(check: ValidationCheck) {
    const result = await execCommand("docker", ["context", "inspect", String(check.params.name)]);
    return result.exitCode === 0;
  }

  private async contextHost(check: ValidationCheck) {
    const result = await execCommand("docker", ["context", "inspect", String(check.params.name)]);
    if (result.exitCode !== 0) {
      return false;
    }
    const context = JSON.parse(result.stdout)[0];
    return context?.Endpoints?.docker?.Host === String(check.params.host);
  }

  private async dockerfileHasHealthcheck(session: SandboxSession, check: ValidationCheck) {
    const dockerfilePath = fileForWorkspace(session, String(check.params.path ?? "/workspace/Dockerfile"));
    return fs.existsSync(dockerfilePath) && /HEALTHCHECK/i.test(fs.readFileSync(dockerfilePath, "utf8"));
  }

  private async containerHealthHealthy(check: ValidationCheck) {
    const containerName = await this.resolveContainerName(String(check.params.name ?? ""));
    if (!containerName) {
      return false;
    }
    const container = await inspectContainer(containerName);
    return container?.State?.Health?.Status === "healthy";
  }

  private async swarmActive(check: ValidationCheck) {
    const result = await execCommand("docker", ["info", "--format", "{{.Swarm.LocalNodeState}}"]);
    return result.exitCode === 0 && result.stdout.trim() === String(check.params.mode ?? "active");
  }

  private async swarmServiceRunning(check: ValidationCheck) {
    const result = await execCommand("docker", ["service", "inspect", String(check.params.name), "--format", "{{.Spec.Mode.Replicated.Replicas}}"]);
    return result.exitCode === 0 && Number(result.stdout.trim()) === Number(check.params.replicas ?? 0);
  }

  private async noStoppedContainers() {
    const result = await execCommand("docker", ["ps", "-a", "--filter", "status=exited", "--format", "{{.Names}}"]);
    return result.exitCode === 0 && result.stdout.trim() === "";
  }

  private async noDanglingImages() {
    const result = await execCommand("docker", ["images", "-f", "dangling=true", "-q"]);
    return result.exitCode === 0 && result.stdout.trim() === "";
  }

  private async noUnusedVolumes() {
    const result = await execCommand("docker", ["volume", "ls", "-qf", "dangling=true"]);
    return result.exitCode === 0 && result.stdout.trim() === "";
  }

  private async serviceOnNetwork(check: ValidationCheck, shouldExist: boolean) {
    const names = await listContainers(true);
    const service = String(check.params.service ?? "");
    const match = names.find((name) => name.includes(`-${service}-`) || name.includes(`_${service}_`));
    if (!match) {
      return false;
    }
    const container = await inspectContainer(match);
    const exists = Boolean(container?.NetworkSettings?.Networks?.[String(check.params.network)]);
    return shouldExist ? exists : !exists;
  }

  private async serviceHasHealthcheck(check: ValidationCheck) {
    const names = await listContainers(true);
    const service = String(check.params.service ?? "");
    const match = names.find((name) => name.includes(`-${service}-`) || name.includes(`_${service}_`));
    if (!match) {
      return false;
    }
    const container = await inspectContainer(match);
    return Boolean(container?.Config?.Healthcheck);
  }

  private async dependsOnHealthy(session: SandboxSession, check: ValidationCheck) {
    const composePath = path.join(session.workspaceDir, "docker-compose.yml");
    if (!fs.existsSync(composePath)) {
      return false;
    }
    const contents = fs.readFileSync(composePath, "utf8");
    return contents.includes(String(check.params.depends_on)) && contents.includes("service_healthy");
  }

  private async scanCriticalCvesZero(session: SandboxSession, check: ValidationCheck) {
    const dockerfilePath = path.join(session.workspaceDir, "Dockerfile");
    if (!fs.existsSync(dockerfilePath)) {
      return false;
    }
    const contents = fs.readFileSync(dockerfilePath, "utf8");
    return contents.includes("ubuntu:22.04") && Boolean(await inspectImage(String(check.params.image)));
  }
}
