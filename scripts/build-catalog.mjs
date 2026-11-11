#!/usr/bin/env node
// Validates every mission file in backend/missions/data/module_XX/ and regenerates
// each module's index.json plus catalog.json (what the backend loads).
//
//   node scripts/build-catalog.mjs          build + validate (exit 1 on errors)
//   node scripts/build-catalog.mjs --check  validate only
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "backend", "missions", "data");
const checkOnly = process.argv.includes("--check");

const MODULES = [
  { id: 1, title: "Arrival", theme: "First day on the ice: get the first services running in containers" },
  { id: 2, title: "Instrument Images", theme: "Package every instrument's software into proper images" },
  { id: 3, title: "Station Network", theme: "Wire the station's services together, safely" },
  { id: 4, title: "Ice-Core Archive", theme: "Make the data outlive containers, upgrades and winter" },
  { id: 5, title: "The Station Stack", theme: "Describe the whole station declaratively with Compose" },
  { id: 6, title: "The Audit", theme: "An auditor arrives from the mainland: harden everything" },
  { id: 7, title: "The Satellite Link", theme: "Ship images over a tiny, unreliable link" },
  { id: 8, title: "Polar Night", theme: "Advanced tooling, resilience and cleanup for the long dark" }
];

const CHECK_TYPES = new Set([
  "container_running", "container_exited", "container_absent", "container_inspect", "container_logs",
  "container_exec", "image_exists", "image_absent", "image_inspect", "image_run", "image_size_under",
  "image_history", "network_exists", "network_absent", "network_inspect", "container_on_network",
  "container_not_on_network", "volume_exists", "volume_absent", "mount", "http", "workspace_file",
  "command_used", "compose_service", "health", "swarm_service", "shell"
]);

const REQUIRED_PARAMS = {
  container_running: ["name"], container_exited: ["name"], container_absent: ["name"],
  container_inspect: ["name", "path"], container_logs: ["name"], container_exec: ["name", "command"],
  image_exists: ["ref"], image_absent: ["ref"], image_inspect: ["ref", "path"], image_run: ["ref"],
  image_size_under: ["ref", "mb"], image_history: ["ref"], network_exists: ["name"], network_absent: ["name"],
  network_inspect: ["name", "path"], container_on_network: ["name", "network"],
  container_not_on_network: ["name", "network"], volume_exists: ["name"], volume_absent: ["name"],
  mount: ["name", "destination"], http: ["url"], workspace_file: ["path"], command_used: ["pattern"],
  compose_service: ["project", "service"], health: ["name"], swarm_service: ["name"], shell: ["command"]
};

const errors = [];
const warnings = [];
const err = (id, message) => errors.push(`${id}: ${message}`);
const warn = (id, message) => warnings.push(`${id}: ${message}`);

function validateMission(mission, file, moduleMeta, levelId) {
  const id = path.basename(file, ".json");
  if (mission.id !== id) err(id, `id "${mission.id}" does not match file name`);
  if (mission.moduleId !== moduleMeta.id) err(id, `moduleId ${mission.moduleId} should be ${moduleMeta.id}`);
  if (mission.levelId !== levelId) err(id, `levelId ${mission.levelId} should be ${levelId}`);
  if (mission.moduleTitle !== moduleMeta.title) err(id, `moduleTitle should be "${moduleMeta.title}"`);
  for (const key of ["title", "story", "startingState", "debrief"]) {
    if (typeof mission[key] !== "string" || !mission[key].trim()) err(id, `missing ${key}`);
  }
  if (!["easy", "medium", "hard"].includes(mission.difficulty)) err(id, `bad difficulty ${mission.difficulty}`);
  if (!Number.isInteger(mission.xp) || mission.xp < 25 || mission.xp > 300) err(id, `bad xp ${mission.xp}`);
  if (!Array.isArray(mission.concepts) || mission.concepts.length === 0) err(id, "concepts must be a non-empty array");
  if (!Array.isArray(mission.objectives) || mission.objectives.length === 0) err(id, "objectives must be a non-empty array");

  if (!Array.isArray(mission.hints) || mission.hints.length !== 3) err(id, "exactly 3 hints required");
  else {
    if (new Set(mission.hints.map((hint) => hint.trim())).size !== 3) err(id, "hints must be distinct");
    for (const hint of mission.hints) {
      const fences = (hint.match(/```/g) ?? []).length;
      if (fences % 2 !== 0) err(id, `hint has an unclosed code fence: ${hint.slice(0, 40)}`);
      if (/^```\w*\s*$/.test(hint.trim())) err(id, "hint is an empty code fence");
    }
  }

  const setup = mission.setup;
  if (!setup || !Array.isArray(setup.files) || !Array.isArray(setup.commands)) err(id, "setup must have files[] and commands[]");
  else for (const file of setup.files) {
    if (!file.path || typeof file.content !== "string") err(id, "setup file needs path + content");
    if (String(file.path).includes("..")) err(id, `setup file path escapes workspace: ${file.path}`);
  }

  if (!Array.isArray(mission.validation) || mission.validation.length === 0) err(id, "validation must be non-empty");
  else for (const check of mission.validation) {
    if (!CHECK_TYPES.has(check.type)) { err(id, `unknown check type ${check.type}`); continue; }
    if (!check.description) err(id, `${check.type} needs a description`);
    for (const param of REQUIRED_PARAMS[check.type]) {
      if (check.params?.[param] === undefined || check.params?.[param] === "") err(id, `${check.type} missing param ${param}`);
    }
    if (check.type === "command_used") {
      try { new RegExp(check.params.pattern); } catch { err(id, `bad regex ${check.params.pattern}`); }
    }
  }
  if (mission.validation?.every((check) => check.type === "command_used")) err(id, "needs at least one state-based check");

  if (!Array.isArray(mission.solution) || mission.solution.length === 0) err(id, "solution must be non-empty");
  const words = mission.story?.split(/\s+/).filter(Boolean).length ?? 0;
  if (words < 40 || words > 180) warn(id, `story is ${words} words`);
}

function similarity(a, b) {
  const wa = new Set(a.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const wb = new Set(b.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const inter = [...wa].filter((word) => wb.has(word)).length;
  return inter / Math.max(1, Math.min(wa.size, wb.size));
}

const modules = [];
const all = [];
for (const meta of MODULES) {
  const dir = path.join(dataDir, `module_${String(meta.id).padStart(2, "0")}`);
  const files = fs.readdirSync(dir).filter((file) => /^module_\d\d_level_\d\d\.json$/.test(file)).sort();
  const missions = [];
  files.forEach((file, index) => {
    let mission;
    try {
      mission = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    } catch (error) {
      err(file, `invalid JSON: ${error.message}`);
      return;
    }
    validateMission(mission, file, meta, index + 1);
    missions.push(mission);
    all.push(mission);
  });
  modules.push({ ...meta, totalLevels: missions.length, missions, dir });
}

// Campaign-wide uniqueness.
const seen = new Map();
for (const mission of all) {
  const titleKey = `title:${mission.title?.toLowerCase()}`;
  if (seen.has(titleKey)) err(mission.id, `title duplicates ${seen.get(titleKey)}`);
  seen.set(titleKey, mission.id);
  for (const hint of mission.hints ?? []) {
    const hintKey = `hint:${hint.trim().toLowerCase()}`;
    if (seen.has(hintKey) && seen.get(hintKey) !== mission.id) err(mission.id, `hint duplicates one in ${seen.get(hintKey)}`);
    seen.set(hintKey, mission.id);
  }
  const signature = JSON.stringify((mission.validation ?? []).map((check) => [check.type, check.params]));
  const sigKey = `validation:${signature}`;
  if (seen.has(sigKey)) err(mission.id, `validation identical to ${seen.get(sigKey)}`);
  seen.set(sigKey, mission.id);
}
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const score = similarity(all[i].story ?? "", all[j].story ?? "");
    if (score > 0.6) warn(all[i].id, `story is very similar to ${all[j].id} (${score.toFixed(2)})`);
  }
}

for (const message of warnings) console.warn(`warn  ${message}`);
for (const message of errors) console.error(`error ${message}`);
const total = all.length;
const xp = all.reduce((sum, mission) => sum + (mission.xp ?? 0), 0);
console.log(`${total} missions in ${modules.length} modules, ${xp} XP total — ${errors.length} errors, ${warnings.length} warnings`);
if (errors.length > 0) process.exit(1);

if (!checkOnly) {
  for (const module of modules) {
    const { dir, ...rest } = module;
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(rest, null, 2) + "\n");
  }
  const catalog = {
    generatedAt: new Date().toISOString(),
    moduleCount: modules.length,
    missionCount: total,
    totalXp: xp,
    modules: modules.map(({ dir, ...rest }) => rest)
  };
  fs.writeFileSync(path.join(dataDir, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
  console.log("wrote catalog.json and module index files");
}
