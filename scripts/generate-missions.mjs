import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());
const modulesDir = path.join(projectRoot, "modules");
const outputDir = path.join(projectRoot, "backend", "missions", "data");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseBulletList(lines) {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || /^\d+\.\s/.test(line))
    .map((line) => line.replace(/^-\s+/, "").replace(/^\d+\.\s+/, "").trim());
}

function splitSections(lines) {
  const sections = [];
  let current = null;
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

function parseValidationLine(rawLine) {
  const line = rawLine.replace(/^- /, "").trim();
  if (!line) {
    return null;
  }
  const separatorIndex = line.indexOf(":");
  const typePart = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
  const rest = separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
  if (!typePart.trim()) {
    return null;
  }
  const params = {};
  const description = rest.trim();
  const matcher = /([a-zA-Z_]+)=(`[^`]+`|\[[^\]]+\]|[^,]+)(?:,\s*|$)/g;
  let match;
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

function deriveWorkspaceFiles(summary) {
  const files = [];
  if (summary.includes("/workspace/app.py")) {
    files.push({ path: "app.py", content: 'print("hello docker")\n' });
  }
  if (summary.includes("/workspace/main.go")) {
    files.push({
      path: "main.go",
      content: 'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("hello from DockerMissions")\n}\n'
    });
  }
  if (summary.includes("/workspace/html/index.html")) {
    files.push({ path: "html/index.html", content: "<h1>DockerMissions</h1>\n" });
  }
  if (summary.includes("/workspace/default-seccomp.json")) {
    files.push({ path: "default-seccomp.json", content: '{ "defaultAction": "SCMP_ACT_ERRNO", "architectures": [], "syscalls": [] }\n' });
  }
  if (summary.includes("legacy-app:v1")) {
    files.push({
      path: "Dockerfile",
      content: "FROM ubuntu:18.04\nRUN apt-get update\nRUN apt-get install -y curl\nRUN apt-get install -y wget\nCMD [\"bash\", \"-lc\", \"sleep 3600\"]\n"
    });
  }
  if (summary.includes("myapp:v1")) {
    files.push({
      path: "Dockerfile",
      content: "FROM ubuntu:22.04\nRUN apt-get update\nRUN apt-get install -y curl\nRUN apt-get install -y wget\nRUN apt-get install -y git\nCMD [\"bash\", \"-lc\", \"echo mission ready\"]\n"
    });
  }
  if (summary.includes("cached-app")) {
    files.push({
      path: "Dockerfile",
      content: "FROM nginx:latest\nCOPY index.html /usr/share/nginx/html/index.html\n"
    });
    files.push({ path: "index.html", content: "<h1>Cache me if you can</h1>\n" });
  }
  if (summary.includes("/workspace` with dockerfile and source files")) {
    files.push({
      path: "Dockerfile",
      content: "FROM nginx:latest\nCOPY index.html /usr/share/nginx/html/index.html\n"
    });
    files.push({ path: "index.html", content: "<h1>Cache me if you can</h1>\n" });
  }
  if (summary.includes("/workspace/dockerfile` with plain `run apt-get install")) {
    files.push({
      path: "Dockerfile",
      content: "FROM ubuntu:22.04\nRUN apt-get update && apt-get install -y curl\n"
    });
  }
  if (summary.includes("cache-mount")) {
    files.push({
      path: "Dockerfile",
      content: "FROM ubuntu:22.04\nRUN apt-get update && apt-get install -y curl\n"
    });
  }
  if (summary.includes("nginx-based")) {
    files.push({
      path: "Dockerfile",
      content: "FROM nginx:latest\nCOPY index.html /usr/share/nginx/html/index.html\n"
    });
    files.push({ path: "index.html", content: "<h1>healthy nginx</h1>\n" });
  }
  if (summary.includes("existing dockerfile in `/workspace`")) {
    files.push({ path: "Dockerfile", content: "FROM node:18-alpine\nWORKDIR /app\nCOPY index.js /app/index.js\nCMD [\"node\", \"/app/index.js\"]\n" });
    files.push({ path: "index.js", content: 'console.log("clean build")\n' });
    files.push({ path: "node_modules/.keep", content: "placeholder\n" });
    files.push({ path: ".git/HEAD", content: "ref: refs/heads/main\n" });
  }
  return files;
}

function parseModule(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const moduleMatch = content.match(/^# Module (\d+) — (.+)$/m);
  const moduleId = Number(moduleMatch[1]);
  const moduleTitle = moduleMatch[2].trim();
  const theme = (content.match(/^\*\*Theme\*\*:\s*(.+)$/m)?.[1] ?? "Unknown").trim();
  const blocks = content.split(/^## /m).slice(1).map((block) => `## ${block}`);
  const missions = blocks.map((block) => {
    const lines = block.split("\n");
    const heading = lines.shift().trim();
    const headingMatch = heading.match(/^## Level (\d+) — (.+)$/);
    const levelId = Number(headingMatch[1]);
    const title = headingMatch[2].trim();
    const sections = splitSections(lines);
    const difficultyLine = lines.find((line) => line.includes("**Difficulty**:")) ?? "";
    const difficulty = (difficultyLine.match(/\*\*Difficulty\*\*:\s*([A-Za-z]+)/)?.[1] ?? "Easy").toLowerCase();
    const xp = Number(difficultyLine.match(/\*\*XP\*\*:\s*(\d+)/)?.[1] ?? 50);
    const story = (lines.find((line) => line.startsWith("**Story**:")) ?? "").replace(/^\*\*Story\*\*:\s*/, "").trim();
    const initialStateSection = sections.find((section) => section.title === "Initial State");
    const initialStateSummary = initialStateSection?.body.filter(Boolean).join(" ").trim() || "Clean Docker environment";
    return {
      id: `module_${String(moduleId).padStart(2, "0")}_level_${String(levelId).padStart(2, "0")}`,
      moduleId,
      levelId,
      title,
      moduleTitle,
      difficulty,
      xp,
      story,
      objectives: parseBulletList(sections.find((section) => section.title === "Objectives")?.body ?? []),
      hints: parseBulletList(sections.find((section) => section.title === "Hints")?.body ?? []),
      validation: (sections.find((section) => section.title === "Validation")?.body ?? []).map(parseValidationLine).filter(Boolean),
      initialState: {
        summary: initialStateSummary,
        workspaceFiles: deriveWorkspaceFiles(initialStateSummary.toLowerCase())
      }
    };
  });
  return { id: moduleId, title: moduleTitle, theme, totalLevels: missions.length, missions };
}

ensureDir(outputDir);
for (const file of fs.readdirSync(outputDir)) {
  if (file.endsWith(".json")) {
    fs.rmSync(path.join(outputDir, file), { force: true });
  }
}

const modules = fs
  .readdirSync(modulesDir)
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => parseModule(path.join(modulesDir, file)));

const catalog = {
  generatedAt: new Date().toISOString(),
  moduleCount: modules.length,
  missionCount: modules.reduce((sum, module) => sum + module.missions.length, 0),
  modules
};

fs.writeFileSync(path.join(outputDir, "catalog.json"), JSON.stringify(catalog, null, 2));
for (const module of modules) {
  const moduleDir = path.join(outputDir, `module_${String(module.id).padStart(2, "0")}`);
  ensureDir(moduleDir);
  fs.writeFileSync(path.join(moduleDir, "index.json"), JSON.stringify(module, null, 2));
  for (const mission of module.missions) {
    fs.writeFileSync(path.join(moduleDir, `${mission.id}.json`), JSON.stringify(mission, null, 2));
  }
}

console.log(`Generated ${catalog.missionCount} mission files across ${catalog.moduleCount} modules in ${outputDir}`);
