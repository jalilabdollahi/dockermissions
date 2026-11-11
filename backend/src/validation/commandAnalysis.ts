/**
 * Looks at the player's recent commands after a failed check and points out common mistakes.
 * Tips are only produced when they relate to a check that actually failed, so a correct
 * command that simply hasn't been run yet doesn't get flagged.
 */

// docker run options that take a value (so the next token is not the image).
const VALUE_FLAGS = new Set([
  "--name", "-e", "--env", "--env-file", "-p", "--publish", "-v", "--volume", "--mount",
  "--network", "--net", "--network-alias", "--ip", "-u", "--user", "-m", "--memory", "--cpus",
  "--pids-limit", "--tmpfs", "--cap-add", "--cap-drop", "--security-opt", "--entrypoint",
  "-w", "--workdir", "-l", "--label", "-h", "--hostname", "--restart", "--platform",
  "--stop-signal", "--stop-timeout", "--health-cmd", "--health-interval", "--health-retries",
  "--health-timeout", "--health-start-period", "--log-driver", "--log-opt", "--add-host", "--dns"
]);

// Options that are almost never meant as arguments to the containerised program.
const MISPLACEABLE = new Set([
  "--name", "--network", "--net", "--publish", "-p", "--volume", "--mount", "--env", "--rm",
  "--detach", "-d", "--restart", "--user", "--memory", "--cpus", "--read-only", "--cap-drop",
  "--cap-add", "--security-opt", "--network-alias", "--tmpfs", "--label", "--init", "--pids-limit"
]);

const CONTAINER_CHECKS = new Set([
  "container_running", "container_inspect", "container_on_network", "mount", "container_exec", "http", "health"
]);

function tokenize(command: string) {
  return command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
}

function findImageIndex(tokens: string[], start: number) {
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token.startsWith("-")) return i;
    i += VALUE_FLAGS.has(token) && !token.includes("=") ? 2 : 1;
  }
  return -1;
}

export function analyzeCommands(commands: string[], failedTypes: Set<string>): string[] {
  const tips: string[] = [];
  const containerProblem = [...failedTypes].some((type) => CONTAINER_CHECKS.has(type));

  for (const raw of commands.slice(-15)) {
    const command = raw.trim();
    const tokens = tokenize(command);

    if (containerProblem && tokens[0] === "docker" && (tokens[1] === "run" || (tokens[1] === "container" && tokens[2] === "run"))) {
      const start = tokens[1] === "run" ? 2 : 3;
      const imageIndex = findImageIndex(tokens, start);
      if (imageIndex === -1) continue;
      const before = tokens.slice(start, imageIndex);
      const after = tokens.slice(imageIndex + 1);

      const misplaced = after.filter((token) => MISPLACEABLE.has(token.replace(/=.*$/, "")));
      if (misplaced.length > 0) {
        tips.push(
          `Options after the image name are passed to the container, not to Docker.\n` +
          `  You ran:   ${command}\n` +
          `  Move ${misplaced.join(", ")} before \`${tokens[imageIndex]}\`.`
        );
      }

      for (let i = 0; i < before.length; i++) {
        if (before[i] === "-p" || before[i] === "--publish") {
          const value = before[i + 1] ?? "";
          if (value && !/^(\d{1,3}(\.\d{1,3}){3}:)?(\d+)?:?\d+(\/(tcp|udp))?$/.test(value)) {
            tips.push(`Port mappings look like \`-p HOST:CONTAINER\` (e.g. \`-p 8080:80\`). Got \`${value}\`.`);
          }
        }
      }
    }

    if (failedTypes.has("container_exec") || failedTypes.has("workspace_file")) {
      if (/^docker\s+exec\s+[^-\s]\S*\s+(ba)?sh\s*$/.test(command)) {
        tips.push(`An interactive shell needs \`-it\`:  ${command.replace(/^docker\s+exec\s+/, "docker exec -it ")}`);
      }
    }

    if ((failedTypes.has("image_exists") || failedTypes.has("image_run") || failedTypes.has("image_inspect")) &&
        /^docker\s+(image\s+)?build\b/.test(command) && !/\s(-t|--tag)(\s|=)/.test(command)) {
      tips.push(`\`docker build\` without \`-t name:tag\` produces an untagged image. Add the tag the mission asks for.`);
    }
  }

  return Array.from(new Set(tips)).slice(-3);
}
