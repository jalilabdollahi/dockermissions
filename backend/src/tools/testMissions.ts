/**
 * Mission test harness. For every mission (or those matching the CLI filters):
 *   1. create a real sandbox session (dm-reset + setup),
 *   2. validate → at least one check must FAIL,
 *   3. run the mission's reference solution inside the sandbox,
 *   4. validate → every check must PASS.
 *
 *   npm run test:missions                     all missions
 *   npm run test:missions -- module_03        one module
 *   npm run test:missions -- module_05_level_04 module_06_level_01
 */
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { Mission } from "../missions/types.js";
import { SandboxManager } from "../sandbox/SandboxManager.js";
import { SandboxRuntime } from "../sandbox/SandboxRuntime.js";
import { ValidationEngine } from "../validation/ValidationEngine.js";

interface MissionReport {
  id: string;
  title: string;
  ok: boolean;
  seconds: number;
  problems: string[];
}

async function main() {
  const filters = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const runtime = new SandboxRuntime();
  const manager = new SandboxManager(runtime);
  const engine = new ValidationEngine(runtime, manager);

  // Read level files directly so a module can be tested before the whole catalog is valid.
  const missions: Mission[] = [];
  for (const moduleDir of fs.readdirSync(env.missionDataDir).filter((name) => /^module_\d\d$/.test(name)).sort()) {
    for (const file of fs.readdirSync(path.join(env.missionDataDir, moduleDir)).filter((name) => /^module_\d\d_level_\d\d\.json$/.test(name)).sort()) {
      const id = file.replace(/\.json$/, "");
      if (filters.length === 0 || filters.some((filter) => id.startsWith(filter))) {
        missions.push(JSON.parse(fs.readFileSync(path.join(env.missionDataDir, moduleDir, file), "utf8")) as Mission);
      }
    }
  }
  console.log(`Testing ${missions.length} mission(s)…`);
  await runtime.ensureRunning();

  const reports: MissionReport[] = [];
  for (const mission of missions) {
    const started = Date.now();
    const problems: string[] = [];
    try {
      const session = await manager.createSession(mission);
      problems.push(...session.setupErrors.map((error) => `setup: ${error}`));

      const before = await engine.validate(session, mission);
      if (before.passed) {
        problems.push("all checks already pass before the solution ran");
      }

      for (const command of mission.solution) {
        manager.appendInput(session.id, `${command.split("\n")[0]}\r`);
        const result = await runtime.shell(command, { timeoutMs: 300_000 });
        fs.appendFileSync(session.commandLogFile, `${command.split("\n")[0]}\n`);
        if (result.exitCode !== 0) {
          problems.push(`solution step failed (${result.exitCode}): ${command.split("\n")[0].slice(0, 120)}\n      ${(result.stderr || result.stdout).trim().split("\n").slice(-3).join("\n      ")}`);
        }
      }

      const after = await engine.validate(session, mission);
      for (const check of after.checks.filter((entry) => !entry.passed)) {
        problems.push(`check failed after solution: ${check.description} [${check.detail ?? ""}]`);
      }
      manager.destroySession(session.id);
    } catch (error) {
      problems.push(`harness error: ${error instanceof Error ? error.message : String(error)}`);
    }

    const ok = problems.filter((problem) => !problem.startsWith("solution step failed")).length === 0;
    const seconds = Math.round((Date.now() - started) / 1000);
    reports.push({ id: mission.id, title: mission.title, ok, seconds, problems });
    console.log(`${ok ? "PASS" : "FAIL"}  ${mission.id}  ${mission.title}  (${seconds}s)`);
    for (const problem of problems) console.log(`      - ${problem}`);
  }

  const failed = reports.filter((report) => !report.ok);
  const outFile = path.join(env.dataDir, "..", "mission-test-report.json");
  fs.writeFileSync(outFile, JSON.stringify({ ranAt: new Date().toISOString(), reports }, null, 2));
  console.log(`\n${reports.length - failed.length}/${reports.length} passed. Report: ${outFile}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
