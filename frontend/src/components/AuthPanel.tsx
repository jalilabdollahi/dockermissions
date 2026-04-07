import { FormEvent, useState } from "react";
import { apiClient } from "../api/client";
import { progressApi } from "../api/progress";
import { useGameStore } from "../store/gameStore";

export function AuthPanel() {
  const { authUser, setAuthUser, setProgress, setLeaderboard } = useGameStore();
  const [username, setUsername] = useState(window.localStorage.getItem(apiClient.playerNameKey) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim()) {
      setError("Please enter a name.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      window.localStorage.setItem(apiClient.playerNameKey, username.trim());
      const [me, prog, lb] = await Promise.all([
        apiClient.request<{ user: { id: string; username: string; email: string; totalXp: number; badges: string[] } | null }>("/api/auth/me"),
        progressApi.getProgress(),
        progressApi.getLeaderboard()
      ]);
      setAuthUser(me.user);
      setProgress(prog.progress);
      setLeaderboard(lb.leaderboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start local player profile");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    window.localStorage.removeItem(apiClient.tokenKey);
    window.localStorage.removeItem(apiClient.playerNameKey);
    setAuthUser(null);
    setProgress([]);
    setLeaderboard([]);
  };

  if (authUser) {
    return (
      <div className="panel auth-panel">
        <div className="panel-heading">
          <span className="panel-label">Pilot</span>
          <button className="btn btn-ghost btn-sm" onClick={logout} type="button">Change name</button>
        </div>
        <div className="auth-user-row">
          <div className="auth-avatar">{authUser.username[0].toUpperCase()}</div>
          <div className="auth-user-info">
            <strong>{authUser.username}</strong>
            <span>Offline profile</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel auth-panel">
      <div className="panel-heading">
        <span className="panel-label">Player Name</span>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          className="auth-input"
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Your name"
          value={username}
          required
        />
        {error && <p className="error-msg">{error}</p>}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "…" : "Start Playing"}
        </button>
      </form>
    </div>
  );
}
