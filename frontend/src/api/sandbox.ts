import { apiClient } from "./client";

export interface SandboxSession {
  sessionId: string;
  missionId: string;
  mode: "docker-host" | "local-shell";
  workspaceDir: string;
  wsUrl: string;
}

export interface ValidationResult {
  passed: boolean;
  failedChecks: string[];
  message: string;
  progress?: {
    xpEarned: number;
    completed: boolean;
    attempts: number;
    hintsUsed: number;
  };
  user?: {
    id: string;
    username: string;
    email: string;
    totalXp: number;
    badges: string[];
  };
}

export const sandboxApi = {
  create(missionId: string) {
    return apiClient.request<SandboxSession>("/api/sandbox/create", {
      method: "POST",
      body: JSON.stringify({ missionId })
    });
  },
  destroy(sessionId: string) {
    return apiClient.request<{ deleted: boolean }>(`/api/sandbox/${sessionId}`, {
      method: "DELETE"
    });
  },
  validate(sessionId: string, missionId: string, hintsUsed: number) {
    return apiClient.request<ValidationResult>(`/api/validate/${sessionId}`, {
      method: "POST",
      body: JSON.stringify({ missionId, hintsUsed })
    });
  }
};
