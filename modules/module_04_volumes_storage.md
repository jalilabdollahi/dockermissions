# Module 04 — Volumes & Storage

**Theme**: Persisting data
**Prerequisite**: Module 03
**Total Levels**: 6
**XP Available**: 500

---

## Level 1 — Named Volume Basics
**Difficulty**: Easy | **XP**: 50

**Story**: Containers are ephemeral — when they die, their data dies too. Named volumes live beyond containers. Create a volume named `app-data`.

**Objectives**:
- Create a Docker named volume called `app-data`

**Validation**:
- `volume_exists`: name=app-data

**Hints**:
1. `docker volume create <name>` creates a named volume
2. `docker volume create app-data`
3. `docker volume create app-data`

---

## Level 2 — Mount a Volume
**Difficulty**: Easy | **XP**: 50

**Story**: A volume is only useful when mounted. Run an `alpine` container named `writer` with volume `app-data` mounted at `/data`, then write a file to it.

**Objectives**:
- Run container `writer` from `alpine` with `app-data` mounted at `/data` (detached, `sleep 3600`)
- Create file `/data/record.txt` inside the container with content `mission=complete`

**Initial State**: Volume `app-data` pre-created

**Validation**:
- `volume_mounted`: container=writer, volume=app-data, path=/data
- `file_in_container`: container=writer, path=/data/record.txt

**Hints**:
1. Use `-v <volume>:<path>` or `--mount` to attach a volume
2. `docker run -d --name writer -v app-data:/data alpine sleep 3600`
3. Then `docker exec writer sh -c 'echo mission=complete > /data/record.txt'`

---

## Level 3 — Data Survives Container Death
**Difficulty**: Medium | **XP**: 100

**Story**: Prove that data in a volume outlives its container. The `writer` container has been removed. Run a new container `reader` on the same volume and confirm the file still exists.

**Initial State**:
- Volume `app-data` exists with `/data/record.txt` containing `mission=complete`
- Container `writer` has been removed

**Objectives**:
- Run container `reader` from `alpine` mounting `app-data` at `/data`
- Read `/data/record.txt` and confirm content is `mission=complete`

**Validation**:
- `volume_mounted`: container=reader, volume=app-data, path=/data
- `file_content`: container=reader, path=/data/record.txt, contains=mission=complete

**Hints**:
1. Mount the same volume in a new container
2. `docker run -d --name reader -v app-data:/data alpine sleep 3600`
3. `docker exec reader cat /data/record.txt` should show `mission=complete`

---

## Level 4 — Bind Mounts
**Difficulty**: Medium | **XP**: 100

**Story**: Bind mounts link a host directory directly into a container — perfect for development. Mount the host directory `/workspace/html` into an nginx container at `/usr/share/nginx/html`.

**Objectives**:
- Run `nginx` container named `dev-web` with host path `/workspace/html` bind-mounted at `/usr/share/nginx/html`, publishing port 8080

**Initial State**: `/workspace/html/index.html` pre-created with `<h1>DockerMissions</h1>`

**Validation**:
- `container_running`: name=dev-web
- `bind_mount`: container=dev-web, host_path=/workspace/html, container_path=/usr/share/nginx/html
- `http_responds`: url=http://localhost:8080, body_contains=DockerMissions

**Hints**:
1. Use `-v /host/path:/container/path` for bind mounts
2. Bind mounts use absolute host paths
3. `docker run -d --name dev-web -v /workspace/html:/usr/share/nginx/html -p 8080:80 nginx`

---

## Level 5 — tmpfs Mount
**Difficulty**: Medium | **XP**: 100

**Story**: Some sensitive data (tokens, secrets) should never touch disk. Use a `tmpfs` mount for in-memory-only storage.

**Objectives**:
- Run container `secure-app` from `alpine` with a `tmpfs` mount at `/secrets` (detached, `sleep 3600`)
- Write a file `/secrets/token.txt` to it
- Confirm the data is in memory (not on a volume or bind mount)

**Validation**:
- `container_running`: name=secure-app
- `tmpfs_mounted`: container=secure-app, path=/secrets
- `file_in_container`: container=secure-app, path=/secrets/token.txt

**Hints**:
1. `--tmpfs <path>` mounts an in-memory filesystem
2. Data in tmpfs is lost when the container stops
3. `docker run -d --name secure-app --tmpfs /secrets alpine sleep 3600`

---

## Level 6 — Volume Backup
**Difficulty**: Hard | **XP**: 200

**Story**: Volumes must be backed up. Use a temporary container to tar the contents of `app-data` volume to `/backup/app-data.tar.gz` on the host.

**Initial State**:
- Volume `app-data` with files pre-created
- Host directory `/backup` exists and is writable

**Objectives**:
- Run a temporary container that mounts `app-data` at `/data` and `/backup` as a bind mount
- Compress `/data` contents into `/backup/app-data.tar.gz`
- Container should stop after completing the backup

**Validation**:
- `file_exists_on_host`: path=/backup/app-data.tar.gz
- `tar_valid`: path=/backup/app-data.tar.gz

**Hints**:
1. Use `docker run --rm` for throwaway containers
2. Mount both the volume and the backup directory
3. `docker run --rm -v app-data:/data -v /backup:/backup alpine tar czf /backup/app-data.tar.gz -C /data .`
