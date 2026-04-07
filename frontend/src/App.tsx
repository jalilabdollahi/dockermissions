import { useEffect } from "react";
import { apiClient } from "./api/client";
import { progressApi } from "./api/progress";
import { AuthPanel } from "./components/AuthPanel";
import { BadgeGallery } from "./components/BadgeGallery";
import { Leaderboard } from "./components/Leaderboard";
import { missionApi } from "./api/missions";
import { ModuleMap } from "./components/ModuleMap";
import { XPBar } from "./components/XPBar";
import { MissionPage } from "./pages/MissionPage";
import { useGameStore } from "./store/gameStore";

export function App() {
  const { authUser, leaderboard, modules, progress, selectedMissionId, setAuthUser, setLeaderboard, setModules, setProgress, selectMission } = useGameStore();

  useEffect(() => {
    missionApi.getModules().then(setModules);
  }, [setModules]);

  useEffect(() => {
    if (!window.localStorage.getItem(apiClient.playerNameKey)) {
      setAuthUser(null);
      setProgress([]);
      progressApi.getLeaderboard().then((r) => setLeaderboard(r.leaderboard));
      return;
    }
    Promise.all([apiClient.request<{ user: { id: string; username: string; email: string; totalXp: number; badges: string[] } | null }>("/api/auth/me"), progressApi.getProgress(), progressApi.getLeaderboard()])
      .then(([me, prog, lb]) => {
        setAuthUser(me.user);
        setProgress(prog.progress);
        setLeaderboard(lb.leaderboard);
      })
      .catch(() => window.localStorage.removeItem(apiClient.playerNameKey));
  }, [setAuthUser, setLeaderboard, setProgress]);

  return (
    <div className="app-shell">
      {/* Left: Campaign map */}
      <ModuleMap
        canPlay={Boolean(authUser)}
        modules={modules}
        onSelectMission={selectMission}
        progress={progress}
        selectedMissionId={selectedMissionId}
      />

      {/* Center: Mission workspace */}
      <MissionPage />

      {/* Right: Stats */}
      <div className="right-rail">
        <AuthPanel />
        <XPBar user={authUser} />
        <Leaderboard entries={leaderboard} />
        <BadgeGallery badges={authUser?.badges ?? []} />
      </div>
    </div>
  );
}
