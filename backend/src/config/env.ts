import path from "node:path";

const backendDir = process.cwd();
const rootDir = path.resolve(backendDir, "..");
const sessionRoot = process.env.SESSION_ROOT ?? path.join(rootDir, "tmp", "sessions");

export const env = {
  port: Number(process.env.PORT ?? 3001),
  // Loopback only by default: the API hands out shells into the sandbox.
  host: process.env.HOST ?? "127.0.0.1",
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  missionDataDir: process.env.MISSION_DATA_DIR ?? path.join(backendDir, "missions", "data"),
  sessionRoot,
  // Where the session root lives on the Docker host (differs only when the backend itself runs in a container).
  sessionRootOnHost: process.env.SESSION_ROOT_HOST ?? sessionRoot,
  dataDir: process.env.DATA_DIR ?? path.join(rootDir, "tmp", "data"),
  sandboxImage: process.env.SANDBOX_IMAGE ?? "dockermissions-sandbox:latest",
  sandboxContainer: process.env.SANDBOX_CONTAINER ?? "dockermissions-sandbox",
  sandboxCacheVolume: process.env.SANDBOX_CACHE_VOLUME ?? "dockermissions-docker-cache",
  sandboxBuildDir: process.env.SANDBOX_BUILD_DIR ?? path.join(rootDir, "docker", "sandbox"),
  sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 30)
};
