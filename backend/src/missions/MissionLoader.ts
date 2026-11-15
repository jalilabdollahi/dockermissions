import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { Mission, MissionCatalog, ModuleSummary, PublicMission } from "./types.js";

export class MissionLoader {
  private catalog = this.loadCatalog();

  private loadCatalog(): MissionCatalog {
    const catalogPath = path.join(env.missionDataDir, "catalog.json");
    if (!fs.existsSync(catalogPath)) {
      throw new Error(`Mission catalog not found at ${catalogPath}. Run: node scripts/build-catalog.mjs`);
    }
    const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as { modules: ModuleSummary[] };
    const missions = parsed.modules.flatMap((module) => module.missions);
    return {
      modules: parsed.modules,
      missions,
      byId: new Map(missions.map((mission) => [mission.id, mission]))
    };
  }

  getCatalog() {
    return this.catalog;
  }

  getModules() {
    return this.catalog.modules;
  }

  getMission(missionId: string) {
    return this.catalog.byId.get(missionId);
  }

  toPublic(mission: Mission): PublicMission {
    const { setup: _setup, solution: _solution, validation, ...rest } = mission;
    return { ...rest, validation: validation.map((check) => ({ description: check.description })) };
  }
}
