# Module 08 — Advanced Docker

**Theme**: Optimization & production patterns
**Prerequisite**: Module 07
**Total Levels**: 7
**XP Available**: 1000

---

## Level 1 — BuildKit and Build Cache
**Difficulty**: Medium | **XP**: 100

**Story**: Docker BuildKit dramatically speeds up builds using intelligent caching and parallel execution. Enable BuildKit and rebuild an existing image to see cache hits.

**Objectives**:
- Set `DOCKER_BUILDKIT=1` environment variable
- Build `cached-app:v1` from `/workspace/Dockerfile`
- Modify only `index.html` (not the Dockerfile) and rebuild as `cached-app:v2`
- Confirm the second build uses cache for unchanged layers

**Initial State**: `/workspace` with Dockerfile and source files

**Validation**:
- `image_exists`: name=cached-app, tag=v1
- `image_exists`: name=cached-app, tag=v2
- `build_used_cache`: image=cached-app:v2

**Hints**:
1. `DOCKER_BUILDKIT=1 docker build ...` enables BuildKit
2. Or set in Docker daemon config: `"features": {"buildkit": true}`
3. `DOCKER_BUILDKIT=1 docker build -t cached-app:v2 /workspace`

---

## Level 2 — Cache Mount in BuildKit
**Difficulty**: Hard | **XP**: 200

**Story**: Package manager downloads are slow and happen on every build. Use BuildKit's `--mount=type=cache` to cache `apt` downloads across builds.

**Objectives**:
- Edit `/workspace/Dockerfile` to use `RUN --mount=type=cache,target=/var/cache/apt apt-get install ...`
- Build `cache-mount:v1` and then `cache-mount:v2` (same Dockerfile, second build should be faster)

**Initial State**: `/workspace/Dockerfile` with plain `RUN apt-get install` instructions

**Validation**:
- `image_exists`: name=cache-mount, tag=v1
- `image_exists`: name=cache-mount, tag=v2
- `dockerfile_uses_cache_mount`: path=/workspace/Dockerfile

**Hints**:
1. `RUN --mount=type=cache,target=/var/cache/apt` caches the apt directory
2. This is a BuildKit-only feature
3. ```dockerfile
   RUN --mount=type=cache,target=/var/cache/apt \
       apt-get update && apt-get install -y curl
   ```

---

## Level 3 — Docker Init
**Difficulty**: Medium | **XP**: 100

**Story**: PID 1 in a container must properly handle signals and reap zombie processes. Use `--init` to run an init process as PID 1.

**Objectives**:
- Run container `signal-safe` from `node:18-alpine` with `--init` flag
- Confirm PID 1 is `docker-init` (tini), not the Node process directly

**Validation**:
- `container_running`: name=signal-safe
- `uses_init`: container=signal-safe

**Hints**:
1. `--init` injects a tiny init process (tini) as PID 1
2. The actual application becomes a child of PID 1
3. `docker run -d --init --name signal-safe node:18-alpine node -e "setInterval(()=>{}, 1000)"`

---

## Level 4 — Docker Context
**Difficulty**: Medium | **XP**: 100

**Story**: Docker contexts let you switch between different Docker daemons (local, remote, production). Create a context named `production` pointing to a remote Docker socket.

**Objectives**:
- Create a Docker context named `production` with host `ssh://deploy@10.0.0.100`
- List contexts to confirm it exists
- Switch back to `default` context after inspection

**Validation**:
- `context_exists`: name=production
- `context_host`: name=production, host=ssh://deploy@10.0.0.100

**Hints**:
1. `docker context create <name> --docker "host=<endpoint>"` creates a context
2. `docker context ls` lists all contexts
3. `docker context create production --docker "host=ssh://deploy@10.0.0.100"`

---

## Level 5 — Healthcheck in Dockerfile
**Difficulty**: Medium | **XP**: 100

**Story**: Docker can monitor your container's health and restart it if it becomes unhealthy. Add a HEALTHCHECK to a Dockerfile for an HTTP service.

**Objectives**:
- Edit `/workspace/Dockerfile` (nginx-based) to add:
  `HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost/ || exit 1`
- Build as `healthy-nginx:v1`
- Run a container and confirm it reaches `healthy` status

**Validation**:
- `image_exists`: name=healthy-nginx, tag=v1
- `dockerfile_has_healthcheck`: path=/workspace/Dockerfile
- `container_health_healthy`: name=*healthy-nginx*

**Hints**:
1. `HEALTHCHECK` is a Dockerfile instruction
2. The CMD must return 0 for healthy, 1 for unhealthy
3. Wait ~30 seconds after starting for the health status to be `healthy`

---

## Level 6 — Docker Swarm Init
**Difficulty**: Hard | **XP**: 200

**Story**: Docker Swarm turns your Docker host into a cluster manager. Initialize a single-node Swarm.

**Objectives**:
- Initialize Docker Swarm with `docker swarm init`
- Deploy a service named `web` with 3 replicas using `nginx` image
- Confirm all 3 replicas are running

**Validation**:
- `swarm_active`: mode=active
- `swarm_service_running`: name=web, replicas=3

**Hints**:
1. `docker swarm init` initializes the Swarm
2. `docker service create --name web --replicas 3 nginx`
3. `docker service ls` shows services; `docker service ps web` shows tasks

---

## Level 7 — Prune Everything
**Difficulty**: Easy | **XP**: 200 (bonus)

**Story**: Your Docker host is running out of disk space. Clean up all stopped containers, unused images, unused networks, and dangling volumes in one sweep.

**Objectives**:
- Remove all stopped containers
- Remove all unused images (not just dangling)
- Remove all unused networks
- Remove all unused volumes
- Confirm disk space is recovered

**Initial State**: Many stopped containers, unused images, and dangling volumes pre-created

**Validation**:
- `no_stopped_containers`: true
- `no_dangling_images`: true
- `no_unused_volumes`: true

**Hints**:
1. `docker system prune -a --volumes` cleans everything at once (with `-a` for all images)
2. Or run individually: `docker container prune`, `docker image prune -a`, `docker volume prune`, `docker network prune`
3. `docker system prune -a --volumes -f`
