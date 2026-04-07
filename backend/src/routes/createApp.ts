import express from "express";
import cors from "cors";
import { env } from "../config/env.js";
import { GameDataStore } from "../data/GameDataStore.js";
import { MissionLoader } from "../missions/MissionLoader.js";
import { SandboxManager } from "../sandbox/SandboxManager.js";
import { ValidationEngine } from "../validation/ValidationEngine.js";

export function createApp(deps: {
  dataStore: GameDataStore;
  missionLoader: MissionLoader;
  sandboxManager: SandboxManager;
  validationEngine: ValidationEngine;
}) {
  const app = express();
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  app.use(express.json());

  app.use((req, _res, next) => {
    const token = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
    const playerName = req.header("x-player-name")?.trim() ?? "";
    const authUser = playerName ? deps.dataStore.getOrCreateOfflineUser(playerName) : deps.dataStore.getUserByToken(token);
    (req as express.Request & { authUser?: ReturnType<GameDataStore["getUserByToken"]> }).authUser = authUser;
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/modules", (_req, res) => {
    res.json(
      deps.missionLoader.getModules().map((module) => ({
        ...module,
        missions: module.missions.map((mission) => ({
          id: mission.id,
          title: mission.title,
          difficulty: mission.difficulty,
          xp: mission.xp
        }))
      }))
    );
  });

  app.post("/api/auth/register", (req, res) => {
    try {
      const result = deps.dataStore.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Registration failed" });
    }
  });

  app.post("/api/auth/login", (req, res) => {
    try {
      const result = deps.dataStore.login(req.body);
      res.json(result);
    } catch (error) {
      res.status(401).json({ message: error instanceof Error ? error.message : "Login failed" });
    }
  });

  app.get("/api/auth/me", (req, res) => {
    res.json({ user: (req as express.Request & { authUser?: unknown }).authUser ?? null });
  });

  app.get("/api/progress", (req, res) => {
    const authUser = (req as express.Request & { authUser?: { id: string } }).authUser;
    if (!authUser) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    res.json({ progress: deps.dataStore.getProgress(authUser.id) });
  });

  app.post("/api/progress/hint", (req, res) => {
    const authUser = (req as express.Request & { authUser?: { id: string } }).authUser;
    if (!authUser) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    deps.dataStore.updateHintUsage(authUser.id, req.body.missionId, Number(req.body.hintsUsed ?? 0));
    res.json({ ok: true });
  });

  app.get("/api/leaderboard", (_req, res) => {
    res.json({ leaderboard: deps.dataStore.getLeaderboard() });
  });

  app.get("/api/missions/:missionId", (req, res) => {
    const mission = deps.missionLoader.getMission(req.params.missionId);
    if (!mission) {
      res.status(404).json({ message: "Mission not found" });
      return;
    }
    res.json(mission);
  });

  app.post("/api/sandbox/create", async (req, res) => {
    const mission = deps.missionLoader.getMission(req.body.missionId);
    if (!mission) {
      res.status(404).json({ message: "Mission not found" });
      return;
    }

    const session = await deps.sandboxManager.createSession(mission);
    res.status(201).json({
      sessionId: session.id,
      missionId: mission.id,
      mode: session.mode,
      workspaceDir: session.workspaceDir,
      wsUrl: `/ws/terminal?sessionId=${session.id}`
    });
  });

  app.get("/api/sandbox/:sessionId/status", (req, res) => {
    const session = deps.sandboxManager.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ status: "dead" });
      return;
    }
    res.json({
      status: "alive",
      missionId: session.missionId,
      mode: session.mode,
      expiresAt: session.expiresAt
    });
  });

  app.delete("/api/sandbox/:sessionId", (req, res) => {
    const deleted = deps.sandboxManager.destroySession(req.params.sessionId);
    res.json({ deleted });
  });

  app.post("/api/validate/:sessionId", async (req, res) => {
    const session = deps.sandboxManager.getSession(req.params.sessionId);
    if (!session) {
      res.status(404).json({ message: "Session not found. Select the mission again to get a fresh sandbox." });
      return;
    }

    const mission = deps.missionLoader.getMission(req.body.missionId ?? session.missionId);
    if (!mission) {
      res.status(404).json({ message: "Mission not found" });
      return;
    }

    try {
      const result = await deps.validationEngine.validate(session, mission);
      const authUser = (req as express.Request & { authUser?: { id: string } }).authUser;
      if (authUser) {
        const reward = deps.dataStore.recordValidation(authUser.id, mission, {
          passed: result.passed,
          hintsUsed: Number(req.body.hintsUsed ?? 0)
        });
        res.json({ ...result, progress: reward.progress, user: reward.user });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error("[validate] error:", err);
      res.json({
        passed: false,
        failedChecks: ["validation engine error"],
        message: err instanceof Error ? err.message : "Validation failed unexpectedly."
      });
    }
  });

  return app;
}
