import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { loadMissionCatalog } from "./MarkdownMissionParser.js";
import { MissionCatalog, ModuleSummary } from "./types.js";

export class MissionLoader {
  private catalog = this.loadCatalog();

  private loadCatalog(): MissionCatalog {
    const catalogPath = path.join(env.missionDataDir, "catalog.json");
    if (fs.existsSync(catalogPath)) {
      const parsed = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as { modules: ModuleSummary[] };
      const missions = parsed.modules.flatMap((module) => module.missions);
      return {
        modules: parsed.modules,
        missions,
        byId: new Map(missions.map((mission) => [mission.id, mission]))
      };
    }
    return loadMissionCatalog(env.missionsDir);
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
}
