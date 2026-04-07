import { apiClient } from "./client";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  totalXp: number;
  badges: string[];
}

export const authApi = {
  register(input: { username: string; email: string; password: string }) {
    return apiClient.request<{ token: string; user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  login(input: { email: string; password: string }) {
    return apiClient.request<{ token: string; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  me() {
    return apiClient.request<{ user: AuthUser | null }>("/api/auth/me");
  }
};

