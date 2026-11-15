import { apiClient } from "./client";

export interface MissionSummary {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  xp: number;
}

export interface ModuleSummary {
  id: number;
  title: string;
  theme: string;
  totalLevels: number;
  missions: MissionSummary[];
}

export interface MissionDetail extends MissionSummary {
  moduleId: number;
  moduleTitle: string;
  levelId: number;
  concepts: string[];
  story: string;
  objectives: string[];
  startingState: string;
  hints: string[];
  validation: Array<{ description: string }>;
  debrief: string;
}

export const missionApi = {
  getModules() {
    return apiClient.request<ModuleSummary[]>("/api/modules");
  },
  getMission(missionId: string) {
    return apiClient.request<MissionDetail>(`/api/missions/${missionId}`);
  }
};

