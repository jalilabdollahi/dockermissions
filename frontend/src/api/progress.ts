import { apiClient } from "./client";

export interface MissionProgress {
  userId: string;
  missionId: string;
  completed: boolean;
  xpEarned: number;
  hintsUsed: number;
  attempts: number;
  completedAt: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  totalXp: number;
  badges: number;
}

export const progressApi = {
  getProgress() {
    return apiClient.request<{ progress: MissionProgress[] }>("/api/progress");
  },
  getLeaderboard() {
    return apiClient.request<{ leaderboard: LeaderboardEntry[] }>("/api/leaderboard");
  },
  recordHint(missionId: string, hintsUsed: number) {
    return apiClient.request<{ ok: true }>("/api/progress/hint", {
      method: "POST",
      body: JSON.stringify({ missionId, hintsUsed })
    });
  }
};
