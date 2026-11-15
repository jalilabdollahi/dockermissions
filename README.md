# DockerMissions 🐳⚔️

![platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS-blue)
![stack](https://img.shields.io/badge/stack-Node.js%20%7C%20React%20%7C%20xterm.js-brightgreen)
![docker](https://img.shields.io/badge/docker-learning-2496ed)

> **Learn Docker by doing — in a real terminal, in your browser.**

DockerMissions is a fully local, browser-based training game for Docker. Each mission gives you a live shell, a clear objective, and automatic validation. No cloud. No costs. No copy-pasting from a blog post.

**54 progressive missions across 8 modules — one continuous story, from first `docker run` to Swarm rolling updates.**

**Design and implementation by: Fatemeh**

---

## ✨ Features

- 🐳 **54 missions** across 8 modules — containers, images, networks, volumes, Compose, security, registries, and advanced Docker
- 🧪 **Isolated Docker-in-Docker sandbox** — missions can't touch your real containers, images or volumes
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
5. **Use the terminal** — run real Docker commands inside the isolated sandbox
6. **Click `Check Mission`** — every requirement is checked against the sandbox's live Docker state
7. **Earn XP** and unlock the next level

---

## 🗺️ Campaign — Kestrel Point Research Station

One continuous story: you are the new platform engineer at a remote polar research station,
moving everything into containers before the polar night cuts the station off from the mainland.
Every level is a different incident with its own characters, starting state and checks.

| # | Module | Levels | Difficulty | Key Topics |
|---|--------|--------|------------|------------|
| 1 | 🟢 Arrival | 8 | Beginner | `docker run`, detached/named, ports, env vars, logs, exec, lifecycle, restart policies |
| 2 | 🟢 Instrument Images | 8 | Beginner → Advanced | pull/tag, Dockerfile basics, `RUN`, `ENTRYPOINT` vs `CMD`, metadata, `.dockerignore`, multi-stage, layer forensics |
| 3 | 🟡 Station Network | 7 | Intermediate | user networks & DNS, aliases, connect/disconnect, internal networks, loopback-only ports, none/host, static IPs |
| 4 | 🟡 Ice-Core Archive | 6 | Intermediate | named volumes, read-only bind mounts, tmpfs, volume backup & restore, shared volumes |
| 5 | 🟡 The Station Stack | 7 | Intermediate | Compose: multi-service, build, healthchecks, scaling, network segmentation, `.env` & profiles |
| 6 | 🔴 The Audit | 6 | Advanced | non-root, read-only rootfs, capabilities, resource limits, secrets as files, no-new-privileges |
| 7 | 🔴 The Satellite Link | 5 | Advanced | local registry, push/pull, digests, save/load, semantic tags |
| 8 | ⚫ Polar Night | 7 | Expert | BuildKit cache & secret mounts, graceful shutdown, contexts, Swarm services & rolling updates, targeted prune |

---

## 🧪 Isolated Sandbox

Missions never touch your own Docker containers, images or volumes. The backend starts one
privileged **Docker-in-Docker** container, `dockermissions-sandbox` (built from
[`docker/sandbox/`](./docker/sandbox)), and everything happens inside it:

- the browser terminal is a bash shell **inside the sandbox** (`/workspace` is the mission's directory),
- before every mission `dm-reset` wipes containers, networks, volumes, contexts, swarm state and
  non-base images, then the mission's `setup` stages its starting state,
- validation inspects the sandbox's inner engine.

Base images (alpine, nginx, redis, postgres, python, golang, registry …) are cached in the
`dockermissions-docker-cache` volume, so resets are fast. `./stop.sh --sandbox` removes the sandbox
container; `docker volume rm dockermissions-docker-cache` drops the cache.

---

## 🛡️ Smart Error Detection

When validation fails, DockerMissions looks at the commands you typed and points out common
mistakes — but only ones related to the checks that actually failed:

```
Options after the image name are passed to the container, not to Docker.
  You ran:   docker run -d httpd:2.4-alpine --name noticeboard -p 8081:80
  Move --name, -p before `httpd:2.4-alpine`.
```

Detected patterns include:
- Docker flags placed after the image name
- Wrong `-p HOST:CONTAINER` format
- `docker exec` into a shell without `-it`
- `docker build` without a `-t` tag

---

## ⚙️ Scripts

| Script | What it does |
|--------|-------------|
| `./start.sh` | Start backend + frontend in the background |
| `./stop.sh` | Stop both services (`--sandbox` also removes the sandbox container) |
| `./restart.sh` | Stop then start |

Logs go to `tmp/logs/backend.log` and `tmp/logs/frontend.log`.

---

## 📁 Project Structure

```
dockermissions/
├── start.sh / stop.sh / restart.sh   ← service management
├── backend/
│   ├── missions/
│   │   ├── AUTHORING.md               ← story bible, mission schema, check catalog, outline
│   │   └── data/module_XX/            ← one JSON file per level (+ generated index/catalog)
│   └── src/
│       ├── data/                      ← offline player progress (JSON on disk)
│       ├── missions/                  ← mission loader and types
│       ├── sandbox/                   ← sandbox container runtime + session lifecycle
│       ├── terminal/                  ← WebSocket PTY relay (node-pty → docker exec)
│       ├── validation/                ← check engine + command analysis
│       ├── tools/testMissions.ts      ← end-to-end mission test harness
│       └── routes/                    ← Express API routes
├── frontend/src/                      ← React UI (terminal, briefing, hints, validation)
├── docker/sandbox/                    ← sandbox image: Dockerfile, dm-reset, dm-prefetch, base image list
└── scripts/build-catalog.mjs          ← validate missions + generate catalog.json
```

---

## ✍️ Writing and Testing Missions

1. Read [`backend/missions/AUTHORING.md`](./backend/missions/AUTHORING.md) — schema, check types, story rules.
2. Edit or add `backend/missions/data/module_XX/module_XX_level_YY.json`.
3. Validate and rebuild the catalog: `node scripts/build-catalog.mjs`
4. Test for real (needs Docker): `cd backend && npm run test:missions -- module_03_level_02`
   The harness stages the mission in the sandbox, confirms the checks fail, runs the mission's
   reference `solution`, and confirms every check passes.
5. Restart the backend to pick up the new catalog.

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
- Docker-in-Docker sandbox (`docker:29-dind` + bash, curl, jq, compose, buildx)
- Per-session workspace directories with automatic cleanup (30-minute TTL)
- Command log (bash history) with analysis for actionable error messages

---

## 📖 Contributing

- **Missions:** follow [`AUTHORING.md`](./backend/missions/AUTHORING.md); every mission needs a passing `solution`.
- **Validation logic:** [`backend/src/validation/ValidationEngine.ts`](./backend/src/validation/ValidationEngine.ts); check types are documented in `AUTHORING.md`.
- **Bugs / ideas:** open an issue with the mission ID and what you expected vs. what happened.

---

## ⭐ Support the Project

If DockerMissions helped you learn Docker:

- 🌟 **Star this repo** — helps others discover it
- 🐛 **Open an issue** — report bugs or suggest new levels
- 🤝 **Contribute** — new missions, validation checks, UI improvements

---

## 📄 License

MIT License.
