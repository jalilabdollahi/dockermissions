export type MissionDifficulty = "easy" | "medium" | "hard";

export interface ValidationCheck {
  type: string;
  params: Record<string, string | number | boolean>;
  description: string;
}

export interface InitialWorkspaceFile {
  path: string;
  content: string;
}

export interface InitialState {
  summary: string;
  workspaceFiles: InitialWorkspaceFile[];
  rawLines: string[];
}

export interface Mission {
  id: string;
  moduleId: number;
  levelId: number;
  title: string;
  moduleTitle: string;
  difficulty: MissionDifficulty;
  xp: number;
  story: string;
  objectives: string[];
  hints: string[];
  validation: ValidationCheck[];
  initialState: InitialState;
}

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

