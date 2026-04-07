import fs from "node:fs";
import path from "node:path";
import { InitialState, Mission, MissionCatalog, MissionDifficulty, ModuleSummary, ValidationCheck } from "./types.js";

interface ParsedSection {
  title: string;
  body: string[];
}

const difficultyMap = new Map<string, MissionDifficulty>([
  ["easy", "easy"],
  ["medium", "medium"],
  ["hard", "hard"]
]);

function parseHeaderValue(line: string, key: string): string {
  return line.replace(new RegExp(`^\\*\\*${key}\\*\\*:\\s*`), "").trim();
}

function parseBulletList(lines: string[]): string[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || /^\d+\.\s/.test(line))
    .map((line) => line.replace(/^-\s+/, "").replace(/^\d+\.\s+/, "").trim());
}

function splitSections(lines: string[]): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const match = line.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
    if (match) {
      current = { title: match[1].trim(), body: [] };
      sections.push(current);
      if (match[2]) {
        current.body.push(match[2]);
      }
      continue;
    }

    if (current) {
      current.body.push(line);
    }
  }

  return sections;
}

function parseValidationLine(rawLine: string): ValidationCheck | null {
  const line = rawLine.replace(/^- /, "").trim();
  const separatorIndex = line.indexOf(":");
  const typePart = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
  const rest = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
  if (!typePart) {
    return null;
  }

  const params: Record<string, string | number | boolean> = {};
  const description = rest.trim();
  const matcher = /([a-zA-Z_]+)=(`[^`]+`|\[[^\]]+\]|[^,]+)(?:,\s*|$)/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(description)) !== null) {
    const key = match[1].trim();
    const rawValue = match[2].trim().replace(/^`|`$/g, "");
    const numericValue = Number(rawValue);
    params[key] = Number.isNaN(numericValue) ? rawValue : numericValue;
  }

  return {
    type: typePart.trim().replace(/`/g, ""),
    params,
    description: description || typePart.trim()
  };
}

function deriveWorkspaceFiles(rawLines: string[]): InitialState["workspaceFiles"] {
  const files: InitialState["workspaceFiles"] = [];
  const joined = rawLines.join("\n");

  if (joined.includes("/workspace/app.py")) {
    files.push({ path: "app.py", content: 'print("hello docker")\n' });
  }

  if (joined.includes("/workspace/main.go")) {
    files.push({
      path: "main.go",
      content: [
        "package main",
        "",
        'import "fmt"',
        "",
        "func main() {",
        '  fmt.Println("hello from DockerMissions")',
        "}"
      ].join("\n") + "\n"
    });
  }

  if (joined.includes("existing Dockerfile in `/workspace`")) {
    files.push({
      path: "Dockerfile",
      content: ["FROM node:18-alpine", "WORKDIR /app", "COPY index.js /app/index.js", 'CMD ["node", "/app/index.js"]'].join("\n") + "\n"
    });
    files.push({
      path: "index.js",
      content: 'console.log("clean build")\n'
    });
    files.push({
      path: "node_modules/.keep",
      content: "placeholder\n"
    });
    files.push({
      path: ".git/HEAD",
      content: "ref: refs/heads/main\n"
    });
  }

  if (joined.includes("/workspace/html/index.html")) {
    files.push({
      path: "html/index.html",
      content: "<h1>DockerMissions</h1>\n"
    });
  }

  if (joined.includes("/workspace/default-seccomp.json")) {
    files.push({
      path: "default-seccomp.json",
      content: '{ "defaultAction": "SCMP_ACT_ERRNO", "architectures": [], "syscalls": [] }\n'
    });
  }

  if (joined.includes("legacy-app:v1")) {
    files.push({
      path: "Dockerfile",
      content: [
        "FROM ubuntu:18.04",
        "RUN apt-get update",
        "RUN apt-get install -y curl",
        "RUN apt-get install -y wget",
        'CMD ["bash", "-lc", "sleep 3600"]'
      ].join("\n") + "\n"
    });
  }

  if (joined.includes("myapp:v1")) {
    files.push({
      path: "Dockerfile",
      content: [
        "FROM ubuntu:22.04",
        "RUN apt-get update",
        "RUN apt-get install -y curl",
        "RUN apt-get install -y wget",
        "RUN apt-get install -y git",
        'CMD ["bash", "-lc", "echo mission ready"]'
      ].join("\n") + "\n"
    });
  }

  if (joined.includes("/workspace` with dockerfile and source files")) {
    files.push({
      path: "Dockerfile",
      content: ["FROM nginx:latest", "COPY index.html /usr/share/nginx/html/index.html"].join("\n") + "\n"
    });
    files.push({
      path: "index.html",
      content: "<h1>Cache me if you can</h1>\n"
    });
  }

  if (joined.includes("/workspace/dockerfile` with plain `run apt-get install")) {
    files.push({
      path: "Dockerfile",
      content: ["FROM ubuntu:22.04", "RUN apt-get update && apt-get install -y curl"].join("\n") + "\n"
    });
  }

  if (joined.includes("nginx-based")) {
    files.push({
      path: "Dockerfile",
      content: ["FROM nginx:latest", "COPY index.html /usr/share/nginx/html/index.html"].join("\n") + "\n"
    });
    files.push({
      path: "index.html",
      content: "<h1>healthy nginx</h1>\n"
    });
  }

  return files;
}

function parseInitialState(section?: ParsedSection): InitialState {
  if (!section) {
    return { summary: "Clean Docker environment", workspaceFiles: [], rawLines: [] };
  }

  const rawLines = section.body.filter((line) => line.trim().length > 0);
  const summary = rawLines.join(" ").trim() || "Clean Docker environment";
  return {
    summary,
    workspaceFiles: deriveWorkspaceFiles(rawLines),
    rawLines
  };
}

function parseMission(moduleId: number, moduleTitle: string, block: string): Mission {
  const lines = block.split("\n");
  const heading = lines.shift()?.trim() ?? "";
  const headingMatch = heading.match(/^## Level (\d+) — (.+)$/);
  if (!headingMatch) {
    throw new Error(`Unable to parse mission heading: ${heading}`);
  }

  const levelId = Number(headingMatch[1]);
  const title = headingMatch[2].trim();
  const sections = splitSections(lines);

  const difficultyLine = lines.find((line) => line.includes("**Difficulty**:")) ?? "";
  const difficultyMatch = difficultyLine.match(/\*\*Difficulty\*\*:\s*([A-Za-z]+)/);
  const xpMatch = difficultyLine.match(/\*\*XP\*\*:\s*(\d+)/);
  const difficultyKey = difficultyMatch?.[1]?.toLowerCase() ?? "easy";
  const difficulty = difficultyMap.get(difficultyKey) ?? "easy";
  const xp = Number(xpMatch?.[1] ?? 50);

  const story = parseHeaderValue(lines.find((line) => line.startsWith("**Story**:")) ?? "**Story**:", "Story");
  const objectives = parseBulletList(sections.find((section) => section.title === "Objectives")?.body ?? []);
  const hints = parseBulletList(sections.find((section) => section.title === "Hints")?.body ?? []);
  const validation = (sections.find((section) => section.title === "Validation")?.body ?? [])
    .map(parseValidationLine)
    .filter((check): check is ValidationCheck => Boolean(check));
  const initialState = parseInitialState(sections.find((section) => section.title === "Initial State"));

  return {
    id: `module_${String(moduleId).padStart(2, "0")}_level_${String(levelId).padStart(2, "0")}`,
    moduleId,
    levelId,
    title,
    moduleTitle,
    difficulty,
    xp,
    story,
    objectives,
    hints,
    validation,
    initialState
  };
}

function parseModuleFile(filePath: string): ModuleSummary {
  const content = fs.readFileSync(filePath, "utf8");
  const moduleHeading = content.match(/^# Module (\d+) — (.+)$/m);
  if (!moduleHeading) {
    throw new Error(`Unable to parse module heading from ${filePath}`);
  }

  const moduleId = Number(moduleHeading[1]);
  const moduleTitle = moduleHeading[2].trim();
  const theme = parseHeaderValue(content.match(/^\*\*Theme\*\*:\s*(.+)$/m)?.[0] ?? "**Theme**: Unknown", "Theme");
  const blocks = content.split(/^## /m).slice(1).map((block) => `## ${block}`);
  const missions = blocks.map((block) => parseMission(moduleId, moduleTitle, block));

  return {
    id: moduleId,
    title: moduleTitle,
    theme,
    totalLevels: missions.length,
    missions
  };
}

export function loadMissionCatalog(missionsDir: string): MissionCatalog {
  const moduleFiles = fs
    .readdirSync(missionsDir)
    .filter((file) => file.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => path.join(missionsDir, file));

  const modules = moduleFiles.map(parseModuleFile);
  const missions = modules.flatMap((module) => module.missions);
  const byId = new Map(missions.map((mission) => [mission.id, mission]));

  return { modules, missions, byId };
}
