# AI Implementation Prompt — DockerMissions

## Context

You are implementing **DockerMissions**, a browser-based interactive learning game for Docker. It is inspired by k8smissions and follows the same pattern: player gets a mission briefing, gets a real terminal connected to a sandboxed Docker environment, completes the mission, and the game validates success automatically.

The full game design is defined across these files:
- `GAME_PLAN.md` — Overall architecture, tech stack, and game design
- `modules/module_01_basics.md` — Module 1: Docker Basics (8 levels)
- `modules/module_02_images_dockerfile.md` — Module 2: Images & Dockerfile (8 levels)
- `modules/module_03_networking.md` — Module 3: Networking (7 levels)
- `modules/module_04_volumes_storage.md` — Module 4: Volumes & Storage (6 levels)
- `modules/module_05_docker_compose.md` — Module 5: Docker Compose (7 levels)
- `modules/module_06_security.md` — Module 6: Security (6 levels)
- `modules/module_07_registry.md` — Module 7: Registry & Distribution (5 levels)
- `modules/module_08_advanced.md` — Module 8: Advanced Docker (7 levels)

**Total: 8 modules, 54 levels**

---

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Terminal**: xterm.js + xterm-addon-fit + xterm-addon-web-links
- **Backend API**: Node.js (Express) or Go (Gin/Fiber)
- **WebSocket**: For terminal I/O between browser and sandbox
- **Sandbox**: Docker-in-Docker (DinD) containers, one per user session
- **Validation Engine**: Node.js scripts using `dockerode` (Docker SDK for Node.js)
- **Session Store**: Redis (sandbox lifecycle, TTL=30min)
- **Database**: PostgreSQL (users, progress, scores)
- **Auth**: JWT + bcrypt, optional GitHub OAuth
- **Container Orchestration**: Docker Compose for dev, optionally K8s for production

---

## What to Build

### Phase 1 — Core Infrastructure

**1. Sandbox Manager** (`backend/sandbox/`)
- `SandboxManager.ts` — creates/destroys Docker-in-Docker containers per user session
- Each sandbox: isolated DinD container with Docker daemon inside
- Exposes Docker socket only within the sandbox
- Resource limits: 512MB RAM, 1 CPU, 10GB disk (overlayfs)
- Auto-destroy after 30 minutes of inactivity (Redis TTL)
- API:
  - `POST /api/sandbox/create` → returns `{sessionId, wsUrl}`
  - `DELETE /api/sandbox/:sessionId` → destroys sandbox
  - `GET /api/sandbox/:sessionId/status` → alive/dead

**2. Terminal WebSocket Relay** (`backend/terminal/`)
- `TerminalRelay.ts` — bridges xterm.js client to `docker exec` inside the sandbox
- User connects via WebSocket → relay opens a PTY (`docker exec -it <sandbox> bash`)
- Bidirectional raw byte stream (no line buffering)
- Handle terminal resize events (SIGWINCH)

**3. Validation Engine** (`backend/validation/`)
- `ValidationEngine.ts` — core validator that inspects Docker state inside a sandbox
- Uses `dockerode` to connect to the sandbox's Docker socket
- Implements all check types listed in `GAME_PLAN.md`:
  - `container_running`, `container_stopped`, `container_not_exists`
  - `image_exists`, `image_not_exists`, `image_label`, `image_size_under`
  - `port_exposed`, `env_var_set`, `no_root`
  - `network_exists`, `container_on_network`, `ping_succeeds`
  - `volume_exists`, `volume_mounted`, `file_in_container`, `file_content`
  - `compose_service_running`, `service_replicas`, `service_on_network`
  - `readonly_rootfs`, `cap_dropped_all`, `cap_added`
  - `http_responds`, `bind_mount`, `tmpfs_mounted`
  - `swarm_active`, `swarm_service_running`
- `validate(sandboxId, checks[])` → `{passed: bool, failedChecks: string[], message: string}`
- API:
  - `POST /api/validate/:sessionId` with `{levelId}` → runs validation, returns result

**4. Mission Data Layer** (`backend/missions/`)
- `MissionLoader.ts` — loads and parses all 54 missions from JSON/YAML definitions
- Convert each module markdown spec into structured `Mission` objects:
  ```typescript
  interface Mission {
    id: string;           // e.g. "module_01_level_03"
    moduleId: number;
    levelId: number;
    title: string;
    difficulty: 'easy' | 'medium' | 'hard';
    xp: number;
    story: string;
    objectives: string[];
    hints: string[];
    initialState: InitialState;
    validation: ValidationCheck[];
    solution: string;
  }
  ```
- `InitialStateProvisioner.ts` — sets up pre-created containers/images/files in sandbox before player starts

**5. Database Schema** (`backend/db/`)
```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  github_id VARCHAR(50),
  total_xp INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Progress
CREATE TABLE progress (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  mission_id VARCHAR(50) NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP,
  xp_earned INTEGER DEFAULT 0,
  hints_used INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  UNIQUE(user_id, mission_id)
);

-- Sessions (also in Redis, but logged here)
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  mission_id VARCHAR(50),
  sandbox_container_id VARCHAR(64),
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  completed BOOLEAN DEFAULT FALSE
);
```

---

### Phase 2 — Frontend

**6. UI Components** (`frontend/src/components/`)

- `MissionBriefing.tsx` — displays story, objectives, difficulty badge, XP reward
- `Terminal.tsx` — xterm.js wrapper, auto-fits to container, handles WebSocket connection
- `HintPanel.tsx` — shows hints one at a time, warns about XP cost after first hint
- `ValidationPanel.tsx` — "Check Mission" button, shows passing/failing checks with icons
- `ModuleMap.tsx` — visual module progress map (like a level select screen)
- `MissionCard.tsx` — individual mission card (locked/unlocked/completed states)
- `XPBar.tsx` — player XP and level progression bar
- `Leaderboard.tsx` — paginated leaderboard table
- `BadgeGallery.tsx` — earned badges display

**7. Game Screen Layout** (`frontend/src/pages/MissionPage.tsx`)
```
+----------------------------------+
| Mission Title | XP | Timer       |
+------------------+---------------+
| Story/Objectives |  Terminal     |
| (scrollable)     |  (xterm.js)   |
|                  |               |
+------------------+               |
| Hints | Validate |               |
+------------------+---------------+
```

**8. State Management** (`frontend/src/store/`)
- Use Zustand or Redux Toolkit
- Slices: `auth`, `mission`, `sandbox`, `progress`
- Persist progress to backend on every validation

**9. API Client** (`frontend/src/api/`)
- `sandboxApi.ts` — create/destroy sandbox
- `missionApi.ts` — fetch missions, submit validation
- `authApi.ts` — login, register, GitHub OAuth
- `progressApi.ts` — get/update user progress

---

### Phase 3 — Mission JSON Definitions

Convert every mission from the markdown module files into structured JSON. Example:

```json
{
  "id": "module_01_level_04",
  "moduleId": 1,
  "levelId": 4,
  "title": "Port Mapping",
  "difficulty": "easy",
  "xp": 50,
  "story": "The web server is running but no one outside can reach it. Map port 8080 on the host to port 80 inside the container.",
  "objectives": [
    "Run an nginx container named 'webserver'",
    "Map host port 8080 to container port 80",
    "Run in detached mode"
  ],
  "hints": [
    "Use the -p flag for port mapping",
    "The format is -p host_port:container_port",
    "docker run -d --name webserver -p 8080:80 nginx"
  ],
  "initialState": {
    "containers": [],
    "images": ["nginx:latest"],
    "networks": [],
    "volumes": []
  },
  "validation": [
    {"type": "container_running", "params": {"name": "webserver"}},
    {"type": "port_exposed", "params": {"container": "webserver", "host_port": 8080, "container_port": 80}}
  ],
  "solution": "docker run -d --name webserver -p 8080:80 nginx"
}
```

Create all 54 mission JSON files in `backend/missions/data/`.

---

### Phase 4 — Docker Infrastructure

**10. Sandbox Dockerfile** (`docker/sandbox/Dockerfile`)
```dockerfile
FROM docker:24-dind
RUN apk add --no-cache bash curl wget git python3 nodejs npm
# Pre-pull common images to speed up missions
RUN dockerd & sleep 5 && \
    docker pull nginx:latest && \
    docker pull alpine:3.18 && \
    docker pull redis:7-alpine && \
    docker pull ubuntu:22.04 && \
    docker pull node:18-alpine && \
    kill %1
```

**11. docker-compose.yml** (development)
```yaml
services:
  backend:
    build: ./backend
    ports: ["3000:3000"]
    environment:
      - DATABASE_URL=postgresql://postgres:secret@db:5432/dockermissions
      - REDIS_URL=redis://redis:6379
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  
  frontend:
    build: ./frontend
    ports: ["5173:5173"]
  
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: dockermissions
    volumes:
      - db-data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    
volumes:
  db-data:
```

---

## Implementation Order

Implement in this exact order to have a working demo as early as possible:

1. **Sandbox Manager** — create/destroy DinD sandboxes
2. **Terminal WebSocket Relay** — browser terminal connected to sandbox
3. **Validation Engine** — implement all check types
4. **Mission JSON** for Module 1 (8 levels) — first full module
5. **InitialStateProvisioner** — set up sandbox before player starts
6. **Basic Frontend** — MissionPage with terminal and validation button
7. **Auth** — JWT login/register
8. **Progress Tracking** — save XP and completion to DB
9. **Module Map** — visual level select
10. **Remaining Missions** — Modules 2–8 (46 more levels)
11. **Hints System** — with XP penalty
12. **Leaderboard** — global and per-module
13. **Badges** — module completion and special achievements
14. **Polish** — animations, sounds, onboarding tutorial

---

## Key Technical Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Container isolation | DinD with separate Docker daemon per user |
| Terminal latency | WebSocket binary frames, no JSON wrapping |
| Sandbox cleanup | Redis TTL + cleanup job every 5 min |
| Pre-warming images | Pre-pull common images in sandbox base image |
| Validation accuracy | Poll every 5s + on-demand via "Check" button |
| DinD security | Rootless Docker or gVisor for production |
| Cold start time | Pre-created pool of warm sandboxes (5-10) |

---

## Folder Structure

```
dockermissions/
├── backend/
│   ├── src/
│   │   ├── sandbox/          # Sandbox lifecycle management
│   │   ├── terminal/         # WebSocket terminal relay
│   │   ├── validation/       # Validation engine + all check types
│   │   ├── missions/         # Mission loader, provisioner, JSON data
│   │   ├── auth/             # JWT auth, GitHub OAuth
│   │   ├── db/               # PostgreSQL schema, migrations, queries
│   │   ├── routes/           # Express routes
│   │   └── index.ts          # Entry point
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Route-level pages
│   │   ├── store/            # Zustand state
│   │   ├── api/              # API client functions
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── docker/
│   └── sandbox/
│       └── Dockerfile        # DinD sandbox image
├── docker-compose.yml
├── GAME_PLAN.md
└── modules/                  # Source-of-truth mission specs (this folder)
```

---

## Success Criteria

- Player can register, log in, and start Module 1 Level 1 within 30 seconds
- Sandbox starts in under 10 seconds (with warm pool)
- Terminal feels snappy (< 50ms input latency)
- Validation runs in under 3 seconds
- All 54 missions are playable end-to-end
- Progress persists across sessions
- Game works on Chrome, Firefox, and Safari
- Mobile-friendly layout (terminal usable on tablet)
