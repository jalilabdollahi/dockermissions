import path from "node:path";

const rootDir = path.resolve(process.cwd(), "..");
const backendDir = process.cwd();

export const env = {
  port: Number(process.env.PORT ?? 3000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  missionsDir: process.env.MISSIONS_DIR ?? path.join(rootDir, "modules"),
  missionDataDir: process.env.MISSION_DATA_DIR ?? path.join(backendDir, "missions", "data"),
  sessionRoot: process.env.SESSION_ROOT ?? path.join(rootDir, "tmp", "sessions"),
  sandboxImage: process.env.SANDBOX_IMAGE ?? "dockermissions-sandbox:latest",
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 30)
};
