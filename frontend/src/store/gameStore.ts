import { AuthUser } from "../api/auth";
import { create } from "zustand";
import { MissionDetail, ModuleSummary } from "../api/missions";
import { LeaderboardEntry, MissionProgress } from "../api/progress";
import { SandboxSession, ValidationResult } from "../api/sandbox";

interface GameState {
  authUser: AuthUser | null;
  modules: ModuleSummary[];
  progress: MissionProgress[];
  leaderboard: LeaderboardEntry[];
  selectedMissionId: string | null;
  mission: MissionDetail | null;
  session: SandboxSession | null;
  validation: ValidationResult | null;
  hintsUsed: number;
  authMode: "login" | "register";
  setAuthUser: (authUser: AuthUser | null) => void;
  setModules: (modules: ModuleSummary[]) => void;
  setProgress: (progress: MissionProgress[]) => void;
  setLeaderboard: (leaderboard: LeaderboardEntry[]) => void;
  selectMission: (missionId: string | null) => void;
  setMission: (mission: MissionDetail | null) => void;
  setSession: (session: SandboxSession | null) => void;
  setValidation: (validation: ValidationResult | null) => void;
  setHintsUsed: (hintsUsed: number) => void;
  setAuthMode: (authMode: "login" | "register") => void;
}

export const useGameStore = create<GameState>((set) => ({
  authUser: null,
  modules: [],
  progress: [],
  leaderboard: [],
  selectedMissionId: null,
  mission: null,
  session: null,
  validation: null,
  hintsUsed: 0,
  authMode: "register",
  setAuthUser: (authUser) => set({ authUser }),
  setModules: (modules) => set({ modules }),
  setProgress: (progress) => set({ progress }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  selectMission: (selectedMissionId) => set({ selectedMissionId, validation: null, hintsUsed: 0 }),
  setMission: (mission) => set({ mission }),
  setSession: (session) => set({ session }),
  setValidation: (validation) => set({ validation }),
  setHintsUsed: (hintsUsed) => set({ hintsUsed }),
  setAuthMode: (authMode) => set({ authMode })
}));

