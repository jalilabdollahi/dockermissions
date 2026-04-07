import http from "node:http";
import { WebSocketServer } from "ws";
import { env } from "./config/env.js";
import { GameDataStore } from "./data/GameDataStore.js";
import { MissionLoader } from "./missions/MissionLoader.js";
import { createApp } from "./routes/createApp.js";
import { SandboxManager } from "./sandbox/SandboxManager.js";
import { TerminalRelay } from "./terminal/TerminalRelay.js";
import { ValidationEngine } from "./validation/ValidationEngine.js";

const dataStore = new GameDataStore();
const missionLoader = new MissionLoader();
const sandboxManager = new SandboxManager();
const validationEngine = new ValidationEngine();

const app = createApp({ dataStore, missionLoader, sandboxManager, validationEngine });
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/terminal" });
new TerminalRelay(sandboxManager).attach(wss);

server.listen(env.port, () => {
  console.log(`DockerMissions backend listening on http://localhost:${env.port}`);
});
