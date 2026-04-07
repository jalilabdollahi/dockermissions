import fs from "node:fs";
import path from "node:path";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { Mission } from "../missions/types.js";
import { ensureDir } from "../utils/fs.js";

interface StoredUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  totalXp: number;
  badges: string[];
  createdAt: string;
}

interface StoredProgress {
  userId: string;
  missionId: string;
  completed: boolean;
  xpEarned: number;
  hintsUsed: number;
  attempts: number;
  completedAt: string | null;
}

interface StoredSession {
  token: string;
  userId: string;
  createdAt: string;
}

interface DatabaseShape {
  users: StoredUser[];
  progress: StoredProgress[];
  sessions: StoredSession[];
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  totalXp: number;
  badges: string[];
}

export class GameDataStore {
  private dbPath: string;
  private moduleMissionCounts: Map<string, number>;

  constructor() {
    const dataDir = path.join(env.sessionRoot, "..", "data");
    ensureDir(dataDir);
    this.dbPath = path.join(dataDir, "game-data.json");
    this.moduleMissionCounts = this.loadModuleMissionCounts();
    if (!fs.existsSync(this.dbPath)) {
      this.writeDb({ users: [], progress: [], sessions: [] });
    }
  }

  register(input: { username: string; email: string; password: string }) {
    const db = this.readDb();
    if (db.users.some((user) => user.username === input.username)) {
      throw new Error("Username already exists");
    }
    if (db.users.some((user) => user.email === input.email)) {
      throw new Error("Email already exists");
    }

    const salt = randomUUID();
    const passwordHash = this.hashPassword(input.password, salt);
    const user: StoredUser = {
      id: randomUUID(),
      username: input.username,
      email: input.email,
      passwordHash,
      salt,
      totalXp: 0,
      badges: [],
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    const session = this.issueSession(db, user.id);
    this.writeDb(db);
    return { token: session.token, user: this.toAuthUser(user) };
  }

  getOrCreateOfflineUser(username: string) {
    const trimmed = username.trim();
    if (!trimmed) {
      return null;
    }

    const db = this.readDb();
    let user = db.users.find((entry) => entry.username.toLowerCase() === trimmed.toLowerCase());
    if (!user) {
      user = {
        id: randomUUID(),
        username: trimmed,
        email: `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@offline.local`,
        passwordHash: "",
        salt: "",
        totalXp: 0,
        badges: [],
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      this.writeDb(db);
    }
    return this.toAuthUser(user);
  }

  login(input: { email: string; password: string }) {
    const db = this.readDb();
    const user = db.users.find((entry) => entry.email === input.email);
    if (!user) {
      throw new Error("Invalid credentials");
    }
    const expected = Buffer.from(user.passwordHash, "hex");
    const actual = Buffer.from(this.hashPassword(input.password, user.salt), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error("Invalid credentials");
    }
    const session = this.issueSession(db, user.id);
    this.writeDb(db);
    return { token: session.token, user: this.toAuthUser(user) };
  }

  getUserByToken(token: string | undefined | null) {
    if (!token) {
      return null;
    }
    const db = this.readDb();
    const session = db.sessions.find((entry) => entry.token === token);
    if (!session) {
      return null;
    }
    const user = db.users.find((entry) => entry.id === session.userId);
    return user ? this.toAuthUser(user) : null;
  }

  getProgress(userId: string) {
    const db = this.readDb();
    return db.progress.filter((entry) => entry.userId === userId);
  }

  getLeaderboard() {
    const db = this.readDb();
    return db.users
      .slice()
      .sort((a, b) => b.totalXp - a.totalXp)
      .map((user, index) => ({
        rank: index + 1,
        username: user.username,
        totalXp: user.totalXp,
        badges: user.badges.length
      }));
  }

  updateHintUsage(userId: string, missionId: string, hintsUsed: number) {
    const db = this.readDb();
    const progress = this.upsertProgress(db, userId, missionId);
    progress.hintsUsed = Math.max(progress.hintsUsed, hintsUsed);
    this.writeDb(db);
    return progress;
  }

  recordValidation(userId: string, mission: Mission, payload: { passed: boolean; hintsUsed: number }) {
    const db = this.readDb();
    const progress = this.upsertProgress(db, userId, mission.id);
    progress.attempts += 1;
    progress.hintsUsed = Math.max(progress.hintsUsed, payload.hintsUsed);

    const user = db.users.find((entry) => entry.id === userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (payload.passed && !progress.completed) {
      progress.completed = true;
      progress.completedAt = new Date().toISOString();
      const penalty = Math.max(0, payload.hintsUsed - 1) * 10;
      progress.xpEarned = Math.max(mission.xp - penalty, Math.ceil(mission.xp * 0.5));
      user.totalXp += progress.xpEarned;
    }

    this.refreshBadges(db, user.id);
    this.writeDb(db);
    return {
      progress,
      user: this.toAuthUser(user)
    };
  }

  private refreshBadges(db: DatabaseShape, userId: string) {
    const user = db.users.find((entry) => entry.id === userId);
    if (!user) {
      return;
    }
    const completedMissionIds = new Set(db.progress.filter((entry) => entry.userId === userId && entry.completed).map((entry) => entry.missionId));
    const moduleBadges = new Set<string>();
    for (const [moduleId, expectedCount] of this.moduleMissionCounts.entries()) {
      const moduleMissionCount = Array.from(completedMissionIds).filter((entry) => entry.startsWith(moduleId)).length;
      if (expectedCount > 0 && moduleMissionCount === expectedCount) {
        moduleBadges.add(`${moduleId}_completion`);
      }
    }
    if (user.totalXp >= 500) {
      moduleBadges.add("xp_500");
    }
    if (user.totalXp >= 1500) {
      moduleBadges.add("xp_1500");
    }
    user.badges = Array.from(new Set([...user.badges, ...moduleBadges]));
  }

  private upsertProgress(db: DatabaseShape, userId: string, missionId: string) {
    let entry = db.progress.find((item) => item.userId === userId && item.missionId === missionId);
    if (!entry) {
      entry = {
        userId,
        missionId,
        completed: false,
        xpEarned: 0,
        hintsUsed: 0,
        attempts: 0,
        completedAt: null
      };
      db.progress.push(entry);
    }
    return entry;
  }

  private issueSession(db: DatabaseShape, userId: string) {
    const session: StoredSession = {
      token: randomUUID(),
      userId,
      createdAt: new Date().toISOString()
    };
    db.sessions = db.sessions.filter((entry) => entry.userId !== userId);
    db.sessions.push(session);
    return session;
  }

  private hashPassword(password: string, salt: string) {
    return scryptSync(password, salt, 64).toString("hex");
  }

  private toAuthUser(user: StoredUser): AuthUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      totalXp: user.totalXp,
      badges: user.badges
    };
  }

  private readDb(): DatabaseShape {
    return JSON.parse(fs.readFileSync(this.dbPath, "utf8")) as DatabaseShape;
  }

  private writeDb(db: DatabaseShape) {
    fs.writeFileSync(this.dbPath, JSON.stringify(db, null, 2), "utf8");
  }

  private loadModuleMissionCounts() {
    const counts = new Map<string, number>();
    const catalogPath = path.join(env.missionDataDir, "catalog.json");
    if (!fs.existsSync(catalogPath)) {
      return counts;
    }
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as { modules: Array<{ id: number; missions: Array<{ id: string }> }> };
    for (const module of catalog.modules) {
      counts.set(`module_${String(module.id).padStart(2, "0")}`, module.missions.length);
    }
    return counts;
  }
}
