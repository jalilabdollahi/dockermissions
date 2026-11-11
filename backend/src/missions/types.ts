export type MissionDifficulty = "easy" | "medium" | "hard";

export type CheckParamValue = string | number | boolean;

export interface ValidationCheck {
  type: string;
  params: Record<string, CheckParamValue>;
  description: string;
}

export interface MissionFile {
  path: string;
  content: string;
}

export interface MissionSetup {
  files: MissionFile[];
  commands: string[];
}

export interface Mission {
  id: string;
  moduleId: number;
  levelId: number;
  title: string;
  moduleTitle: string;
  difficulty: MissionDifficulty;
  xp: number;
  concepts: string[];
  story: string;
  objectives: string[];
  startingState: string;
  hints: string[];
  setup: MissionSetup;
  validation: ValidationCheck[];
  /** Reference solution used by the test harness; never sent to the browser. */
  solution: string[];
  debrief: string;
}

/** What the browser receives for a mission: no setup commands, no solution. */
export type PublicMission = Omit<Mission, "setup" | "solution" | "validation"> & {
  validation: Array<Pick<ValidationCheck, "description">>;
};

export interface ModuleSummary {
  id: number;
  title: string;
  theme: string;
  totalLevels: number;
  missions: Mission[];
}

export interface MissionCatalog {
  modules: ModuleSummary[];
  missions: Mission[];
  byId: Map<string, Mission>;
}
