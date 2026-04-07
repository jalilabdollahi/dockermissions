# DockerMissions 🐳⚔️

![platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS-blue)
![stack](https://img.shields.io/badge/stack-Node.js%20%7C%20React%20%7C%20xterm.js-brightgreen)
![docker](https://img.shields.io/badge/docker-learning-2496ed)

> **Learn Docker by doing — in a real terminal, in your browser.**

DockerMissions is a fully local, browser-based training game for Docker. Each mission gives you a live shell, a clear objective, and automatic validation. No cloud. No costs. No copy-pasting from a blog post.

**54 progressive challenges across 8 modules — complete beginner to production patterns.**

**Design and implementation by: Fatemeh**

---

## ✨ Features

- 🐳 **54 missions** across 8 modules — containers, images, networks, volumes, Compose, security, registries, and advanced Docker
- 🏆 **XP & progression system** — earn points, unlock levels, rise through operator tiers
- 💡 **Progressive hints** — reveal only what you need, with XP deduction after the first hint
- ✅ **Instant automated validation** — click Check Mission and get a real result in seconds
- 🔍 **Smart error analysis** — detects syntax mistakes and wrong flag ordering with a corrected example
- 🖥️ **In-browser terminal** — real bash session connected to a live Docker environment
- 🏅 **Badges** — awarded per module completion and XP milestones
- 📊 **Leaderboard** — track top pilots by XP
- 💾 **Offline player profiles** — no account needed, progress saved locally

---

## 🚀 Quick Start

```bash
git clone <repo-url>
cd dockermissions

# Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# Generate mission data
node scripts/generate-missions.mjs

# Start both services
./start.sh
```

Open **http://localhost:5173**, enter a player name, and pick your first mission.

---

## 📋 Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 18+ | Required for backend and frontend |
| [Docker](https://docs.docker.com/get-docker/) | 24+ | Must be running for live validation |
| npm | 9+ | Included with Node.js |

---

## 🎮 How to Play

1. **Open** `http://localhost:5173`
2. **Enter a player name** in the right panel to start your offline profile
3. **Select a mission** from the campaign map on the left
4. **Read the briefing** — understand the objective and starting state
5. **Use the terminal** — run real Docker commands to complete the mission
6. **Click `Check Mission`** — automated validation runs against the live Docker state
7. **Earn XP** and unlock the next level

---

## 🗺️ Campaign — 8 Modules · 54 Levels · 4,550 XP

| # | Module | Levels | XP | Difficulty | Key Topics |
|---|--------|--------|----|------------|------------|
| 1 | 🟢 Docker Basics | 8 | 450 | Beginner | `docker run`, ports, env vars, exec, logs |
| 2 | 🟢 Images & Dockerfile | 8 | 650 | Beginner | `FROM`, `RUN`, `COPY`, multi-stage, `.dockerignore` |
| 3 | 🟡 Networking | 7 | 600 | Intermediate | Bridge, custom networks, DNS, host, none |
| 4 | 🟡 Volumes & Storage | 6 | 500 | Intermediate | Named volumes, bind mounts, tmpfs, backups |
| 5 | 🟡 Docker Compose | 7 | 600 | Intermediate | Multi-service stacks, health checks, scaling |
| 6 | 🔴 Security | 6 | 750 | Advanced | Non-root, read-only rootfs, capabilities, seccomp |
| 7 | 🔴 Registry & Distribution | 5 | 450 | Advanced | Tagging, local registry, push/pull, layer history |
| 8 | ⚫ Advanced Docker | 7 | 1000 | Expert | BuildKit, Swarm, contexts, cache mounts, prune |

---

## 🛡️ Smart Error Detection

When validation fails, DockerMissions analyses the commands you typed and flags common mistakes:

```
Command issue detected:
Flags after the image name are passed to the container, not Docker.
  You wrote:  docker run -d nginx --name webserver
  Move --name before the image name.
  Example:    docker run -d --name webserver nginx
```

Detected patterns include:
- Docker flags placed after the image name
- Wrong `-p HOST:CONTAINER` format
- Missing `-d` flag when detached mode is required
- `docker exec` without `-it` when opening a shell
- `docker build` without a `-t` tag

---

## ⚙️ Scripts

| Script | What it does |
|--------|-------------|
| `./start.sh` | Start backend + frontend in the background |
| `./stop.sh` | Stop both services |
| `./restart.sh` | Stop then start |

Logs go to `tmp/logs/backend.log` and `tmp/logs/frontend.log`.

---

## 📁 Project Structure

```
dockermissions/
├── start.sh / stop.sh / restart.sh   ← service management
├── backend/
│   ├── missions/data/                 ← generated mission JSON (54 levels)
│   └── src/
│       ├── data/                      ← offline player progress (JSON on disk)
│       ├── missions/                  ← mission loader and parser
│       ├── sandbox/                   ← session and workspace lifecycle
│       ├── terminal/                  ← WebSocket PTY relay (node-pty)
│       ├── validation/                ← mission validation + error analysis
│       └── routes/                    ← Express API routes
├── frontend/
│   └── src/
│       ├── components/                ← UI components (terminal, briefing, hints…)
│       ├── api/                       ← typed API clients
│       ├── pages/                     ← MissionPage layout
│       ├── store/                     ← Zustand game state
│       └── styles/                    ← global CSS (dark terminal theme)
├── docker/
│   └── sandbox/                       ← sandbox Dockerfile
├── modules/                           ← source-of-truth mission specs (Markdown)
│   ├── module_01_basics.md
│   ├── module_02_images_dockerfile.md
│   ├── module_03_networking.md
│   ├── module_04_volumes_storage.md
│   ├── module_05_docker_compose.md
│   ├── module_06_security.md
│   ├── module_07_registry.md
│   └── module_08_advanced.md
├── scripts/
│   └── generate-missions.mjs          ← parse modules/ → backend/missions/data/
├── GAME_PLAN.md                       ← full design document
└── AI_IMPLEMENTATION_PROMPT.md        ← implementation spec for AI assistants
```

---

## 🔄 Regenerating Mission Data

After editing any file in `modules/`, regenerate the mission JSON:

```bash
node scripts/generate-missions.mjs
```

Then restart the backend to pick up the changes.

---

## 🧩 Tech Stack

### Frontend
- React 18 + TypeScript + Vite
- xterm.js (terminal emulator with PTY resize support)
- Zustand (state management)
- Inter + JetBrains Mono (via Google Fonts)

### Backend
- Node.js + Express + TypeScript (ESM)
- node-pty (real PTY, not pipe — gives a proper interactive shell)
- ws (WebSocket server)
- File-backed JSON store (no database required)

### Runtime
- Host Docker socket for live container/image/network/volume validation
- Per-session workspace directories with automatic cleanup (30-minute TTL)
- Command log with syntax analysis for actionable error messages

---

## 📖 Contributing

**To add or change missions:**
1. Edit the relevant file in [`modules/`](./modules)
2. Regenerate: `node scripts/generate-missions.mjs`
3. Test the mission flow in the UI

**To change validation logic:**
- Edit [`backend/src/validation/ValidationEngine.ts`](./backend/src/validation/ValidationEngine.ts)
- All check types are documented in [`GAME_PLAN.md`](./GAME_PLAN.md)

**To report a bug or suggest a new mission:**
- Open an issue with the mission ID and what you expected vs. what happened

---

## ⭐ Support the Project

If DockerMissions helped you learn Docker:

- 🌟 **Star this repo** — helps others discover it
- 🐛 **Open an issue** — report bugs or suggest new levels
- 🤝 **Contribute** — new missions, validation checks, UI improvements

---

## 📄 License

MIT License.
