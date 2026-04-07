# Module 06 — Docker Security

**Theme**: Hardening containers
**Prerequisite**: Module 05
**Total Levels**: 6
**XP Available**: 750

---

## Level 1 — Run as Non-Root
**Difficulty**: Easy | **XP**: 50

**Story**: Containers running as root are dangerous. If they escape, they own your host. Run an alpine container as user ID `1000` instead of root.

**Objectives**:
- Run container `safe-app` from `alpine` as user `1000` (`sleep 3600`, detached)
- Confirm the container process does NOT run as root

**Validation**:
- `container_running`: name=safe-app
- `no_root`: container=safe-app

**Hints**:
1. Use `--user <uid>` to set the container user
2. `--user 1000`
3. `docker run -d --name safe-app --user 1000 alpine sleep 3600`

---

## Level 2 — Read-Only Filesystem
**Difficulty**: Easy | **XP**: 50

**Story**: A container that can't write to its own filesystem is significantly harder to compromise. Run nginx in read-only mode.

**Objectives**:
- Run `nginx` container named `readonly-web` with a read-only filesystem (`--read-only`)
- Nginx needs a writable tmpfs at `/tmp` and `/var/run` to start — add those
- Publish port 8080

**Validation**:
- `container_running`: name=readonly-web
- `readonly_rootfs`: container=readonly-web
- `http_responds`: url=http://localhost:8080, status=200

**Hints**:
1. `--read-only` makes the root filesystem read-only
2. Combine with `--tmpfs` for directories that must be writable
3. `docker run -d --name readonly-web --read-only --tmpfs /tmp --tmpfs /var/run -p 8080:80 nginx`

---

## Level 3 — Drop Linux Capabilities
**Difficulty**: Medium | **XP**: 100

**Story**: Containers inherit too many Linux capabilities by default. Drop ALL capabilities from a container and add back only what's needed.

**Objectives**:
- Run container `minimal-caps` from `alpine` dropping ALL capabilities with `--cap-drop=ALL`
- Add back only `NET_BIND_SERVICE` with `--cap-add`
- Run `sleep 3600` detached

**Validation**:
- `container_running`: name=minimal-caps
- `cap_dropped_all`: container=minimal-caps
- `cap_added`: container=minimal-caps, cap=NET_BIND_SERVICE

**Hints**:
1. `--cap-drop=ALL` drops every Linux capability
2. `--cap-add=<CAP>` adds individual capabilities back
3. `docker run -d --name minimal-caps --cap-drop=ALL --cap-add=NET_BIND_SERVICE alpine sleep 3600`

---

## Level 4 — Seccomp Profile
**Difficulty**: Medium | **XP**: 100

**Story**: Seccomp filters which system calls a container can make. Apply the default Docker seccomp profile explicitly to lock down `syscall-test` container.

**Objectives**:
- Run container `syscall-test` from `alpine` with the default seccomp profile applied explicitly
- Run `sleep 3600` detached

**Initial State**: `/workspace/default-seccomp.json` contains Docker's default seccomp profile

**Validation**:
- `container_running`: name=syscall-test
- `seccomp_applied`: container=syscall-test

**Hints**:
1. `--security-opt seccomp=<path>` applies a seccomp profile
2. The profile is JSON file defining allowed syscalls
3. `docker run -d --name syscall-test --security-opt seccomp=/workspace/default-seccomp.json alpine sleep 3600`

---

## Level 5 — Resource Limits
**Difficulty**: Medium | **XP**: 100

**Story**: A runaway container can starve the host. Limit container `resource-hog` to 256MB RAM and 0.5 CPU.

**Objectives**:
- Run container `resource-hog` from `alpine` with:
  - Memory limit: `256m`
  - CPU limit: `0.5`
- Run `sleep 3600` detached

**Validation**:
- `container_running`: name=resource-hog
- `memory_limit`: container=resource-hog, limit=268435456 (256MB in bytes)
- `cpu_limit`: container=resource-hog, cpus=0.5

**Hints**:
1. `--memory 256m` sets RAM limit; `--cpus 0.5` sets CPU limit
2. These prevent the container from consuming unlimited host resources
3. `docker run -d --name resource-hog --memory 256m --cpus 0.5 alpine sleep 3600`

---

## Level 6 — Scan an Image for Vulnerabilities
**Difficulty**: Hard | **XP**: 350

**Story**: You've built an image `legacy-app:v1`. Use Docker Scout or Trivy to scan it for critical CVEs, then rebuild using an updated base image to eliminate the critical vulnerabilities.

**Objectives**:
- Scan `legacy-app:v1` (pre-built with old ubuntu base) and identify critical vulnerabilities
- Rebuild with updated base image `ubuntu:22.04` as `legacy-app:v2`
- Scan `legacy-app:v2` and confirm zero critical CVEs

**Initial State**:
- `legacy-app:v1` pre-built using `ubuntu:18.04` (has known CVEs)
- `/workspace/Dockerfile` available for editing

**Validation**:
- `image_exists`: name=legacy-app, tag=v2
- `scan_critical_cves_zero`: image=legacy-app:v2

**Hints**:
1. `docker scout cves legacy-app:v1` or `trivy image legacy-app:v1`
2. Change `FROM ubuntu:18.04` to `FROM ubuntu:22.04` in the Dockerfile
3. Rebuild: `docker build -t legacy-app:v2 /workspace`
