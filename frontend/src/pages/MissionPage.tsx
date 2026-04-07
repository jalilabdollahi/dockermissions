import { useEffect, useRef, useState } from "react";
import { missionApi } from "../api/missions";
import { progressApi } from "../api/progress";
import { sandboxApi } from "../api/sandbox";
import { HintPanel } from "../components/HintPanel";
import { MissionBriefing } from "../components/MissionBriefing";
import { Terminal } from "../components/Terminal";
import { ValidationPanel } from "../components/ValidationPanel";
import { useGameStore } from "../store/gameStore";

export function MissionPage() {
  const {
    authUser, hintsUsed, mission, selectedMissionId, session, validation,
    setAuthUser, setHintsUsed, setLeaderboard, setMission, setProgress, setSession, setValidation
  } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const previousSessionRef = useRef<string | null>(null);
  // Keep a ref so handleValidate can read authUser without being in effect deps
  const authUserRef = useRef(authUser);
  useEffect(() => { authUserRef.current = authUser; }, [authUser]);

  // Clear sandbox when the user logs out
  useEffect(() => {
    if (!authUser) {
      setMission(null);
      setSession(null);
      setValidation(null);
    }
  }, [authUser, setMission, setSession, setValidation]);

  // Load mission + create sandbox only when the selected mission changes
  useEffect(() => {
    if (!authUser || !selectedMissionId) return;
    let cancelled = false;
    setLoading(true);
    setValidation(null);

    Promise.all([missionApi.getMission(selectedMissionId), sandboxApi.create(selectedMissionId)])
      .then(([nextMission, nextSession]) => {
        if (cancelled) return;
        setMission(nextMission);
        setSession(nextSession);
        const prev = previousSessionRef.current;
        if (prev && prev !== nextSession.sessionId) {
          sandboxApi.destroy(prev).catch(() => null);
        }
        previousSessionRef.current = nextSession.sessionId;
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMissionId, setMission, setSession, setValidation]);

  useEffect(() => {
    return () => {
      if (session) sandboxApi.destroy(session.sessionId).catch(() => null);
    };
  }, [session]);

  const handleValidate = async () => {
    if (!session || !mission) return;
    setValidating(true);
    try {
      const result = await sandboxApi.validate(session.sessionId, mission.id, hintsUsed);
      setValidation(result);
      if (result.user) setAuthUser(result.user);
      if (authUserRef.current) {
        const [prog, lb] = await Promise.all([progressApi.getProgress(), progressApi.getLeaderboard()]);
        setProgress(prog.progress);
        setLeaderboard(lb.leaderboard);
      }
    } catch (error) {
      setValidation({
        passed: false,
        failedChecks: [],
        message: error instanceof Error ? error.message : "Validation failed unexpectedly."
      });
    } finally {
      setValidating(false);
    }
  };

  const handleRevealHint = async (next: number) => {
    setHintsUsed(next);
    if (authUser && mission) {
      await progressApi.recordHint(mission.id, next).catch(() => null);
    }
  };

  if (!authUser) {
    return (
      <div className="mission-page" style={{ display: "flex" }}>
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-icon">👤</div>
          <h1>Enter your name</h1>
          <p>Pick a local player name on the right to unlock the offline campaign and save your progress on this machine.</p>
        </div>
        <div style={{ flex: 1, background: "#010409", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 40, opacity: 0.08 }}>$_</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-faint)" }}>
            Sandbox will appear here
          </span>
        </div>
      </div>
    );
  }

  if (!selectedMissionId) {
    return (
      <div className="mission-page" style={{ display: "flex" }}>
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="empty-icon">🎯</div>
          <h1>Pick a mission</h1>
          <p>Select any level from the campaign map to spin up a live Docker training environment.</p>
        </div>
        <div style={{ flex: 1, background: "#010409", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 40, opacity: 0.08 }}>$_</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-faint)" }}>
            Sandbox will appear here
          </span>
        </div>
      </div>
    );
  }

  if (loading || !mission || !session) {
    return (
      <div className="mission-page" style={{ display: "flex" }}>
        <div className="empty-state" style={{ flex: 1 }}>
          <div className="preparing-spinner" />
          <h1>Preparing sandbox</h1>
          <p>Provisioning the mission workspace and terminal session…</p>
        </div>
        <div style={{ flex: 1, background: "#010409" }} />
      </div>
    );
  }

  return (
    <div className="mission-page">
      <div className="left-column">
        <MissionBriefing mission={mission} />
        <HintPanel hintsUsed={hintsUsed} mission={mission} onReveal={handleRevealHint} />
        <ValidationPanel onValidate={handleValidate} result={validation} validating={validating} />
      </div>
      <Terminal wsUrl={session.wsUrl} mode={session.mode} />
    </div>
  );
}
