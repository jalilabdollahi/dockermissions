# DockerMissions — Mission Authoring Guide

This file is the single source of truth for writing missions. Mission data lives in
`backend/missions/data/module_XX/module_XX_level_YY.json` (one file per level).
`node scripts/build-catalog.mjs` validates every file and regenerates `catalog.json`
and each module's `index.json`. Never edit those generated files by hand.

---

## 1. How the runtime works (what a mission can rely on)

- Every player terminal runs **inside an isolated sandbox container** (`dockermissions-sandbox`,
  Docker-in-Docker, Alpine-based, Docker 29, `docker compose` v2 plugin and `docker buildx` available).
  The player never touches the host's Docker.
- The shell is **bash**, working directory **`/workspace`** (a fresh, empty directory per mission).
  Tools available: `bash curl jq nano vim tree less tar gzip coreutils findutils grep sed procps
  iproute2 bind-tools (dig/nslookup) openssl git`.
- Before each mission the engine runs `dm-reset`: all containers, custom networks, volumes, contexts,
  extra buildx builders and swarm state are removed, and every image tag that is **not** a base image
  is removed. The build cache survives.
- **Base images** are always present (pre-pulled). Use only these unless a mission is *about* pulling:

  ```
  alpine:3.20   busybox:1.37   nginx:alpine   nginx:1.27-alpine   httpd:2.4-alpine
  redis:7-alpine   postgres:16-alpine   python:3.12-alpine   golang:1.23-alpine   registry:2
  ```

  A mission that teaches `docker pull` must use an image that is NOT in this list (e.g. `busybox:1.36`,
  `alpine:3.19`, `nginx:1.26-alpine`), otherwise the check passes before the player does anything.
- Container names must be at least 2 characters.
- Published ports (`-p 8080:80`) are reachable from the sandbox shell as `http://localhost:8080`.
  Prefer ports in 8000–9999. Never use port 2375/2376.
- Internet access is available inside the sandbox (for `apk add`, `pip install`, pulls), but keep
  network-heavy steps small. No `apt-get`/Ubuntu images — use Alpine (`apk add --no-cache ...`).
- Setup commands and solution commands run as `bash -lc` inside the sandbox, cwd `/workspace`.

## 2. The storyline (one continuous campaign)

**Kestrel Point Research Station** — a remote polar research station on a windswept island. The
station is replacing a tangle of hand-run scripts and a dying server with containers before the
long polar night cuts it off from the mainland. The player is the station's newly arrived
**platform engineer** (addressed as "engineer" — never by gender).

Recurring cast (use names; avoid gendered pronouns for them — use their name or "they"):

| Name | Role | Voice |
|------|------|-------|
| **Ingrid Halvorsen** | Station chief | Calm, terse, practical; gives the big-picture "why" |
| **Tomasz Wierzba** | Glaciologist, owns the ice-core archive | Anxious about data loss, very precise |
| **Amara Okafor** | Data scientist, writes the Python tools | Fast, experimental, leaves messes |
| **Kip Lindqvist** | Summer intern | Enthusiastic, breaks things, asks naive questions |
| **Rafael Duarte** | Captain of the supply ship *Petrel* | Only appears when something ships to/from the mainland |
| **Wren Achebe** | External security auditor from the mainland | Strict, checklists, Module 6 |
| **NORA** | The station's ancient monitoring bot | Speaks in terse ALL-CAPS status lines |

Arc by module:
1. **Arrival** — first day, the old server is failing; get the first services running in containers.
2. **Instrument Images** — package each instrument's software into proper images.
3. **Station Network** — wire the services together so they can find and talk to each other safely.
4. **Ice-Core Archive** — data must survive container restarts, upgrades and the winter.
5. **The Station Stack** — describe the whole station declaratively with Compose.
6. **The Audit** — Wren arrives; harden everything.
7. **The Satellite Link** — bandwidth to the mainland is tiny; distribute images efficiently.
8. **Polar Night** — the sun sets for months; advanced tooling, resilience, and cleanup.

Story rules:
- Each mission is a **different incident or request** with its own concrete stakes. No two missions
  may share a premise (e.g. "Kip deleted something" may appear at most once in the whole campaign).
- `story` is 2–4 short paragraphs (separated by `\n\n`), 60–140 words total, ends with a clear ask.
  Show the situation through a character (a message, a radio call, a note taped to a rack, a NORA alert).
- Vary openings. Do not start more than one mission per module with the same device
  (radio call / NORA alert / note / conversation / log excerpt / checklist / email).
- No "Welcome, recruit", no "your mission, should you choose", no generic filler.

## 3. Mission JSON schema

```jsonc
{
  "id": "module_03_level_02",          // module_XX_level_YY
  "moduleId": 3,
  "levelId": 2,
  "title": "Answer to an Old Name",     // unique across the campaign, 2–5 words, no "Hello"
  "moduleTitle": "Station Network",     // fixed per module (see outline)
  "difficulty": "easy" | "medium" | "hard",
  "xp": 75,                             // easy 50–75, medium 100–150, hard 175–250
  "concepts": ["network aliases", "--network-alias"],   // 1–4 tags, the skill taught
  "story": "...",                       // see story rules
  "objectives": ["..."],                // 1–5 concrete, checkable bullets; name every resource exactly
  "startingState": "...",               // one or two sentences: what already exists when the shell opens
  "hints": ["...", "...", "..."],      // exactly 3, progressive, all DIFFERENT (see hint rules)
  "setup": {
    "files": [ { "path": "app/main.py", "content": "..." } ],   // relative to /workspace
    "commands": [ "docker run -d --name old-printer alpine:3.20 sleep infinity" ]
  },
  "validation": [ { "type": "...", "params": { ... }, "description": "..." } ],
  "solution": [ "bash command", "..." ],   // NEVER shown to the player; used by the test harness
  "debrief": "..."                      // 1–3 sentences shown on success: the takeaway + a pro tip
}
```

Field rules:
- **objectives** must name exact resource names/tags/ports/paths that validation checks.
- **hints**: exactly 3. Hint 1 = the concept / which command family (no flags). Hint 2 = the specific
  flags or Dockerfile instruction, with a partial example. Hint 3 = a near-complete worked example
  (may use a fenced code block: "```bash\n...\n```" or "```dockerfile\n...\n```" inside the string).
  Hints must be different from each other; never repeat text between hints.
- **validation[].description** is shown to the player when the check FAILS — write it as a
  human-readable requirement, e.g. "Container `beacon` is running from `nginx:alpine`".
- **solution** must be a complete, non-interactive solution (no `-it`, no editors; write files with
  heredocs `cat > Dockerfile <<'EOF' ... EOF`). The harness verifies: before the solution at least one
  check FAILS; after the solution every check PASSES. Long-running containers: `sleep infinity`.
- **setup.commands** must be idempotent-ish and fast; they run right after `dm-reset`.
- Never require the player to use `-it` interactive programs for validation to pass (they may, but
  the solution must work without them).

## 4. Validation check catalog

All checks run against the sandbox's Docker engine. `name` = container name. `ref` = image reference
(`repo:tag`; tag required). Comparison params available on the *_inspect checks:
`equals` (string/number/bool compare, arrays/objects compared as JSON), `contains` (substring for
strings, element for arrays, key for objects), `not_contains`, `exists` (true/false), `not_equals`.
`path` is a dot path into `docker inspect` JSON, e.g. `HostConfig.Memory`, `Config.Labels.station`,
`NetworkSettings.Networks.station-net.Aliases`, `State.Health.Status`.

| type | params | passes when |
|------|--------|-------------|
| `container_running` | `name`, `image?` | container exists and is running (image matches `Config.Image` exactly if given) |
| `container_exited` | `name`, `exit_code?` | container exists, is not running, optional exit code matches |
| `container_absent` | `name` | no container with that name |
| `container_inspect` | `name`, `path`, comparison | inspect field comparison |
| `container_logs` | `name`, `contains`, `not_contains?` | `docker logs` (stdout+stderr) contains text |
| `container_exec` | `name`, `command`, `exit_code?`(0), `output_contains?`, `output_not_contains?`, `output_equals?` | `docker exec name sh -c "command"` result |
| `image_exists` | `ref` | image tag exists |
| `image_absent` | `ref` | image tag does not exist |
| `image_inspect` | `ref`, `path`, comparison | `docker image inspect` field comparison (e.g. `Config.User`, `Config.Env`, `Config.Labels.x`) |
| `image_run` | `ref`, `args?`, `entrypoint?`, `exit_code?`(0), `output_contains?`, `output_not_contains?` | `docker run --rm [--entrypoint e] ref args` (15 s timeout) |
| `image_size_under` | `ref`, `mb` | image size < mb megabytes |
| `image_history` | `ref`, `max_layers?`, `not_contains?` | `docker history --no-trunc` has ≤ max_layers rows / no row containing text |
| `network_exists` | `name`, `driver?`, `internal?`, `subnet?` | network exists with optional properties |
| `network_absent` | `name` | no such network |
| `network_inspect` | `name`, `path`, comparison | network inspect comparison |
| `container_on_network` | `name`, `network`, `alias?`, `ip?` | container attached; optional alias / IPv4 match |
| `container_not_on_network` | `name`, `network` | container exists and is NOT attached |
| `volume_exists` | `name` | volume exists |
| `volume_absent` | `name` | volume does not exist |
| `mount` | `name`, `destination`, `type?`(volume/bind/tmpfs), `source?`, `rw?` | container has a mount at destination. `source` = volume name for volumes, or a `/workspace/...` path for binds |
| `http` | `url`, `status?`(200), `body_contains?`, `from?` | `curl` from the sandbox shell; with `from`, runs `wget -qO-` inside that container instead (status not checked then). Retries 5× over ~5 s |
| `workspace_file` | `path`, `exists?`(true), `contains?`, `not_contains?`, `matches?`(regex) | file under `/workspace` (path relative or `/workspace/...`) |
| `command_used` | `pattern` (JS regex) | a command matching the regex was typed in the terminal. Use rarely — only when the *how* is the lesson and state cannot prove it |
| `compose_service` | `project`, `service`, `running?`(1 = at least one), `count?` (exact running count) | containers labelled with the compose project/service |
| `health` | `name`, `status?`(healthy) | `State.Health.Status` equals status |
| `swarm_service` | `name`, `replicas?`, `image_contains?`, `running?` | swarm service spec replicas / image / running task count |
| `shell` | `command`, `exit_code?`(0), `output_contains?`, `output_not_contains?`, `output_equals?` | `bash -lc command` in the sandbox, cwd `/workspace` (20 s timeout). Use for registries, swarm details, tar contents, contexts, etc. |

Semantics notes:
- `path` segments are split on `.`, but keys that themselves contain dots or slashes are matched
  greedily, so `Config.Labels.com.docker.compose.project` and `HostConfig.Tmpfs./scratch` both work.
  Array fields with `contains` match a whole element (e.g. `Config.Env` contains `UNITS=metric`).
- `output_equals` compares trimmed output. `image_run.args` is a raw string appended to the
  `docker run` command line (shell-parsed). `image_size_under.mb` uses 1 MB = 1,000,000 bytes
  (same as `docker images`).
- A missing inspect value (e.g. `Config.User` on an image without `USER`): `equals`/`contains` FAIL,
  `not_equals`/`not_contains` PASS, `exists: false` passes. Use `exists: true` to require a value.
- Docker 29 stores capabilities with the prefix: `HostConfig.CapAdd` contains `CAP_NET_BIND_SERVICE`.
- `image_run` and `container_exec` support `output_equals` too (same as `shell`).
- `mount` also sees `--tmpfs` mounts (they only appear in `HostConfig.Tmpfs`).
- `workspace_file` with `contains`/`not_contains`/`matches` fails when the file does not exist.

Prefer specific checks over `shell`. Every mission needs at least one check that proves the
*outcome* (state), not just that a command was typed.

## 5. Campaign outline (fixed — every level teaches a different primary skill)

Write the mission for the given concept. You may refine the scenario, names, and details, but keep
the **primary skill** and keep resource names unique across the campaign (prefix ideas are given).

### Module 1 — Arrival (`moduleTitle`: "Arrival") — basics, easy
| L | Title idea | Primary skill | Scenario seed |
|---|-----------|---------------|---------------|
| 1 | First Light | `docker run` a one-shot container; exit code; `docker ps -a` | Prove the new engine works: run `alpine:3.20` named `first-light` that prints `KESTREL POINT ONLINE` and exits 0 |
| 2 | Keep the Beacon Lit | detached + named long-running container | NORA's status page must stay up: `nginx:alpine` named `beacon` in background |
| 3 | The Noticeboard | publishing ports `-p` | Crew needs the noticeboard (`httpd:2.4-alpine`, `noticeboard`) on port 8081 |
| 4 | Calibrate the Sensor | environment variables `-e` | Run `sensor-sim` with `STATION=kestrel`, `UNITS=metric`, `INTERVAL=30` |
| 5 | Static on the Radio | `docker logs` (+ `--tail`/`--since`/grep) | Setup container spews noise with one hidden frequency code; player writes it to `/workspace/frequency.txt` |
| 6 | Inside the Thermostat | `docker exec` (run commands inside a running container) | Change config inside a running `thermostat` container |
| 7 | Generator Rotation | lifecycle: `stop`, `start`, `rm`, `docker ps -a` | Rotate generator containers: stop one, start a stopped one, remove a dead one |
| 8 | Weather the Storm | `docker update --restart` + `docker rename` | Make the wind logger survive restarts and give it its proper name |

### Module 2 — Instrument Images (`moduleTitle`: "Instrument Images")
| L | Title idea | Primary skill | Scenario seed |
|---|-----------|---------------|---------------|
| 1 | Supplies from the Mainland | `docker pull` a specific tag + `docker tag` | Pull `busybox:1.36` (non-base!) and tag it `kestrel/toolbox:1.0` |
| 2 | A Recipe for Greetings | first Dockerfile: `FROM`, `COPY`, `CMD`, `docker build -t` | Package a provided shell script into `kestrel/greeter:1.0` |
| 3 | Tools for the Field Kit | `RUN apk add` in a Dockerfile | Build `kestrel/fieldkit:1.0` containing curl + jq |
| 4 | Celsius or Fahrenheit | `ENTRYPOINT` vs `CMD` (default args, override) | Converter image whose default arg can be overridden at `docker run` |
| 5 | Label the Crates | `LABEL`, `ENV`, `WORKDIR`, `ARG` + `--build-arg` | Image metadata the inventory system reads |
| 6 | Leave the Secrets Ashore | `.dockerignore` | Build context contains `secrets.env` + huge raw data; image must not contain them |
| 7 | Travel Light | multi-stage build | Compile a tiny Go tool with `golang:1.23-alpine`, ship it on `alpine:3.20` under N MB |
| 8 | Ghost in the Layers | image layers are permanent (`docker history`, deleting a file in a later layer doesn't remove it) | A legacy image "deleted" a password in a later layer — recover it from history/layers, then rebuild a clean image |

### Module 3 — Station Network (`moduleTitle`: "Station Network")
| L | Title idea | Primary skill | Scenario seed |
|---|-----------|---------------|---------------|
| 1 | Names on the Wire | user-defined bridge network + container DNS by name | `station-net`, a redis-backed weather cache reachable by name |
| 2 | Answer to an Old Name | `--network-alias` | New archive service must answer to the legacy hostname `archive` |
| 3 | Moving Day for the Printer | `docker network connect` / `disconnect` on a running container | Move `lab-printer` from the default bridge to `lab-net` without restarting it |
| 4 | The Sealed Vault | `--internal` network | Seed vault service must have no route out |
| 5 | Admin Eyes Only | bind a published port to `127.0.0.1` only | Admin panel reachable only via loopback |
| 6 | Isolation Chamber | `--network none` and `--network host` modes | One container fully offline, one sharing the host stack |
| 7 | Fixed Addresses | custom subnet + `--ip` static address | Legacy sensors expect `172.28.0.7` on `sensor-grid` |

### Module 4 — Ice-Core Archive (`moduleTitle`: "Ice-Core Archive")
| L | Title idea | Primary skill | Scenario seed |
|---|-----------|---------------|---------------|
| 1 | Cores Outlive Containers | named volumes persist after container removal | Write core samples into `ice-cores`, delete the container, data remains |
| 2 | The Field Journal | bind mount (read-only) of a host directory | Serve `/workspace/journal` via nginx read-only, live edits appear |
| 3 | Scratch Paper | `tmpfs` mounts | Decoder writes temp files only to RAM (`/scratch`, size-limited) |
| 4 | Pack for the Ship | back up a volume to a tarball | `seismo-data` → `/workspace/backups/seismo.tar.gz` via a helper container |
| 5 | Unpack the Delivery | restore a tarball into a new volume | `/workspace/incoming/glacier.tar.gz` → volume `glacier-data` |
| 6 | One Writer, Many Readers | sharing a volume between containers, `:ro` for readers | `producer` writes, `reader-*` mount the same volume read-only |

### Module 5 — The Station Stack (`moduleTitle`: "The Station Stack")
| L | Title idea | Primary skill | Scenario seed |
|---|-----------|---------------|---------------|
| 1 | Write It Down Once | first `compose.yaml`, `docker compose up -d`, project name | Dashboard service via compose, project `station` |
| 2 | Two Services, One File | multi-service compose + `environment` + `depends_on` | Python API + redis cache |
| 3 | Build on Arrival | `build:` in compose + `image:` naming | Compose builds `kestrel/ingest:dev` from local Dockerfile |
| 4 | Wait for the Database | healthchecks + `depends_on: condition: service_healthy` | Postgres with healthcheck; migrator runs only when healthy and exits 0 |
| 5 | Many Hands | `docker compose up --scale` / `deploy.replicas`, no fixed host ports | Scale `worker` to 3 |
| 6 | Front Door, Back Room | multiple compose networks for segmentation | proxy on front, db on back, api on both |
| 7 | Settings Without Edits | `.env` interpolation + `profiles` | Debug toolbox only under a profile; tags/ports come from `.env` |

### Module 6 — The Audit (`moduleTitle`: "The Audit")
| L | Title idea | Primary skill | Scenario seed |
|---|-----------|---------------|---------------|
| 1 | Nobody Runs as Root | `--user uid:gid` at runtime | Telemetry container must run as 1000:1000 |
| 2 | Carved in Stone | `--read-only` rootfs + tmpfs for writable paths | Ledger service immutable except `/tmp` |
| 3 | Fewer Keys on the Ring | `--cap-drop ALL` + `--cap-add` only what's needed | Gatekeeper keeps only `NET_BIND_SERVICE` |
| 4 | Rationing | `--memory`, `--cpus`, `--pids-limit` | Cruncher limited so it can't starve the station |
| 5 | Secrets Belong in Files | stop baking secrets in ENV; mount as file (compose `secrets:` or bind) | Rebuild image without `API_KEY` env, provide `/run/secrets/api_key` |
| 6 | A Relay That Can't Escalate | `USER` in Dockerfile + `--security-opt no-new-privileges` | Build `kestrel/safe-relay:1.0` that runs unprivileged by default |

### Module 7 — The Satellite Link (`moduleTitle`: "The Satellite Link")
| L | Title idea | Primary skill | Scenario seed |
|---|-----------|---------------|---------------|
| 1 | A Depot on the Ice | run a local `registry:2` with a volume | `depot` on port 5000, data in `depot-data` |
| 2 | First Shipment | tag for a registry + `docker push` | Push an image as `localhost:5000/kestrel/beacon:1.0` |
| 3 | Round Trip | remove local copy, `docker pull` back from the registry; digests | Verify the pulled image's digest, record it |
| 4 | Sneakernet | `docker save` / `docker load` | Satellite is down: export to tar for the *Petrel*, load a delivered tar |
| 5 | Many Names, One Image | semantic version tags (2.1.0 → 2.1 → 2 → latest) pushed to the registry | All tags resolve to the same manifest digest |

### Module 8 — Polar Night (`moduleTitle`: "Polar Night")
| L | Title idea | Primary skill | Scenario seed |
|---|-----------|---------------|---------------|
| 1 | Don't Download Twice | BuildKit cache mounts `RUN --mount=type=cache` | pip/apk cache persisted across builds |
| 2 | Whisper to the Builder | BuildKit build secrets `RUN --mount=type=secret` | Token used during build but absent from image + history |
| 3 | A Graceful Goodbye | `--init`, `STOPSIGNAL` / `--stop-signal`, `--stop-timeout` | Logger must flush on shutdown; PID 1 reaps zombies |
| 4 | The Other Station | `docker context create` / `use` | Context `backup-station` for the second engine endpoint |
| 5 | A Swarm in the Dark | `docker swarm init` + `docker service create --replicas` + publish | `aurora-feed` with 3 replicas |
| 6 | Change the Watch | `docker service update` rolling update (image + update config) | Roll `aurora-feed` to a new image with parallelism 1 and a delay |
| 7 | Clearing the Snowdrifts | targeted cleanup: `prune` with `--filter` (labels/until) | Free disk but keep everything labelled `keep=true` |

## 6. Uniqueness checklist (verify before you finish)

- [ ] Title, story premise, opening device, and resource names are unique across the campaign.
- [ ] Hints: 3 distinct strings; hint 3 differs from hint 2; no hint is just the objective repeated.
- [ ] Validation set is not a copy of another mission's set (different checks or different focus).
- [ ] `solution` passes all checks; before solution at least one check fails.
- [ ] Only base images used (except pull missions), Alpine-based tooling, ports 8000–9999 (or 5000 for registry missions).
