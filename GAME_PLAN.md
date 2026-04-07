# DockerMissions — Game Design Plan

## Concept

DockerMissions is a browser-based, terminal-driven interactive learning game where players complete real Docker challenges inside sandboxed environments. Inspired by k8smissions, each mission teaches a Docker concept through hands-on tasks with instant validation and feedback.

---

## Core Game Loop

1. Player reads a mission briefing (story + objective)
2. Player is given an in-browser terminal connected to a real Docker environment
3. Player runs Docker commands to solve the mission
4. The game validates success automatically (checks containers, images, networks, volumes, etc.)
5. Player earns XP, badges, and unlocks the next mission

---

## Tech Stack (Recommended)

- **Frontend**: React + TypeScript + xterm.js (terminal emulator)
- **Backend**: Node.js / Go API server
- **Sandbox**: Docker-in-Docker (DinD) per session, or rootless Docker via gVisor
- **Session Management**: Redis (TTL-based sandbox lifecycle)
- **Validation Engine**: Go or Node.js scripts that inspect Docker state via Docker API/SDK
- **Database**: PostgreSQL (user progress, scores, sessions)
- **Auth**: JWT-based, optional OAuth (GitHub)

---

## Modules Overview

| # | Module | Levels | Theme |
|---|--------|--------|-------|
| 1 | Docker Basics | 8 | First contact with containers |
| 2 | Images & Dockerfile | 8 | Building your own images |
| 3 | Networking | 7 | Connecting containers |
| 4 | Volumes & Storage | 6 | Persisting data |
| 5 | Docker Compose | 7 | Multi-container apps |
| 6 | Security | 6 | Hardening containers |
| 7 | Registry & Distribution | 5 | Sharing images |
| 8 | Advanced Docker | 7 | Optimization & production |

**Total: 8 modules, 54 levels**

---

## Progression System

- Each level awards XP (Easy=50, Medium=100, Hard=200)
- Modules unlock sequentially; levels within a module unlock sequentially
- Badges awarded per module completion and special achievements
- Global leaderboard by XP
- Hints system: 3 hints per level (costs XP if used after first hint)

---

## Mission Structure (per level)

```
{
  id: "module_01_level_03",
  title: "String name",
  difficulty: "easy | medium | hard",
  xp: 50 | 100 | 200,
  story: "Narrative briefing text",
  objectives: ["list of what player must accomplish"],
  hints: ["hint 1", "hint 2", "hint 3"],
  initial_state: {  // what is pre-configured in the sandbox
    containers: [],
    images: [],
    networks: [],
    volumes: []
  },
  validation: {  // what the engine checks
    type: "container_running | image_exists | network_connected | ...",
    checks: []
  },
  solution: "Reference solution (hidden from player)"
}
```

---

## Sandbox Architecture

```
Player Browser
     |
     | WebSocket (terminal I/O)
     v
Backend API
     |
     | Spawn per-session
     v
Docker-in-Docker container (isolated per user)
     |
     | Docker SDK/CLI
     v
Validation Engine (polls or event-driven)
```

- Sandbox lifetime: 30 minutes (extendable)
- Max 1 active sandbox per user
- Sandboxes destroyed on completion or timeout
- Resource limits: 512MB RAM, 1 CPU per sandbox

---

## Validation Engine

The validation engine inspects the Docker daemon inside the sandbox using the Docker SDK. It runs checks every 5 seconds or on-demand (player clicks "Check").

Supported check types:
- `container_running`: container with name/image is running
- `container_stopped`: container exists but stopped
- `image_exists`: image with tag exists locally
- `port_exposed`: container exposes a specific port
- `env_var_set`: container has env var with value
- `network_exists`: named network exists
- `container_on_network`: container attached to network
- `volume_mounted`: volume mounted in container at path
- `file_in_container`: file exists inside container at path
- `compose_stack_running`: all compose services healthy
- `image_label`: image has specific label
- `no_root`: container runs as non-root user

---

## Files in This Plan

- `GAME_PLAN.md` — This file (overall design)
- `modules/module_01_basics.md` — Docker Basics
- `modules/module_02_images_dockerfile.md` — Images & Dockerfile
- `modules/module_03_networking.md` — Networking
- `modules/module_04_volumes_storage.md` — Volumes & Storage
- `modules/module_05_docker_compose.md` — Docker Compose
- `modules/module_06_security.md` — Security
- `modules/module_07_registry.md` — Registry & Distribution
- `modules/module_08_advanced.md` — Advanced Docker
- `AI_IMPLEMENTATION_PROMPT.md` — Full prompt for AI implementation
