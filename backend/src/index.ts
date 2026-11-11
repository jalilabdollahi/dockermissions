import http from "node:http";
import { WebSocketServer } from "ws";
import { env } from "./config/env.js";
import { GameDataStore } from "./data/GameDataStore.js";
import { MissionLoader } from "./missions/MissionLoader.js";
import { createApp } from "./routes/createApp.js";
import { SandboxManager } from "./sandbox/SandboxManager.js";
import { SandboxRuntime } from "./sandbox/SandboxRuntime.js";
import { TerminalRelay } from "./terminal/TerminalRelay.js";
import { ValidationEngine } from "./validation/ValidationEngine.js";

const runtime = new SandboxRuntime();
const missionLoader = new MissionLoader();
const dataStore = new GameDataStore(missionLoader);
const sandboxManager = new SandboxManager(runtime);
const validationEngine = new ValidationEngine(runtime, sandboxManager);

const app = createApp({ dataStore, missionLoader, sandboxManager, validationEngine });
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/terminal" });
new TerminalRelay(sandboxManager).attach(wss);

server.listen(env.port, env.host, () => {
  console.log(`DockerMissions backend listening on http://${env.host}:${env.port}`);
  // Warm up the sandbox so the first mission opens quickly.
  runtime.hostDockerAvailable().then((available) => {
    if (!available) {
      console.warn("[sandbox] Docker is not reachable on this machine; missions cannot start until it is.");
      return;
    }
    runtime.ensureRunning().then(
      () => console.log("[sandbox] ready"),
      (error) => console.error("[sandbox] failed to start:", error)
    );
  });
});
