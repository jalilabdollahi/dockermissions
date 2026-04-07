# Module 01 — Docker Basics

**Theme**: First contact with containers
**Prerequisite**: None
**Total Levels**: 8
**XP Available**: 550

---

## Level 1 — Hello, Container!
**Difficulty**: Easy | **XP**: 50

**Story**: Welcome, recruit. Your first mission is simple: prove you can launch a container. The docks are quiet, but not for long.

**Objectives**:
- Run an `nginx` container in the foreground (any name)

**Initial State**: Clean Docker environment

**Validation**:
- `container_running`: image=nginx

**Hints**:
1. The command to run a container is `docker run`
2. Try `docker run nginx`
3. `docker run nginx` — this runs nginx in the foreground

---

## Level 2 — Detach and Name
**Difficulty**: Easy | **XP**: 50

**Story**: Running in the foreground blocks your terminal. Real operators run containers in the background. Name your assets so you can find them later.

**Objectives**:
- Run an `nginx` container named `webserver` in detached mode

**Initial State**: Clean Docker environment

**Validation**:
- `container_running`: name=webserver, image=nginx

**Hints**:
1. Use flags to detach and name: `-d` and `--name`
2. `docker run -d --name webserver nginx`
3. `docker run -d --name webserver nginx`

---

## Level 3 — Inspect the Fleet
**Difficulty**: Easy | **XP**: 50

**Story**: A good operator always knows the state of their fleet. List all running containers and identify the one named `mission-agent`.

**Initial State**: Container `mission-agent` (alpine, running) pre-created

**Objectives**:
- Run `docker ps` to see running containers (validation auto-passes after you run `docker ps` once)
- Extra: Find the container ID of `mission-agent` and run `docker inspect mission-agent`

**Validation**:
- `command_run`: docker ps executed
- `command_run`: docker inspect mission-agent executed

**Hints**:
1. `docker ps` lists running containers
2. `docker inspect <name>` shows full details
3. `docker ps` then `docker inspect mission-agent`

---

## Level 4 — Port Mapping
**Difficulty**: Easy | **XP**: 50

**Story**: The web server is running but no one outside can reach it. Map port 8080 on the host to port 80 inside the container.

**Objectives**:
- Run an `nginx` container named `webserver` mapping host port 8080 to container port 80, in detached mode

**Initial State**: Clean Docker environment

**Validation**:
- `container_running`: name=webserver
- `port_exposed`: container=webserver, host_port=8080, container_port=80

**Hints**:
1. Use `-p` flag for port mapping: `-p host:container`
2. `docker run -d --name webserver -p 8080:80 nginx`
3. `docker run -d --name webserver -p 8080:80 nginx`

---

## Level 5 — Environment Variables
**Difficulty**: Easy | **XP**: 50

**Story**: Applications need configuration. Pass secrets and settings through environment variables — never hardcode them.

**Objectives**:
- Run a container from image `alpine` named `env-demo` with env var `APP_ENV=production` and `APP_VERSION=1.0`, keep it running (use `sleep 3600`)

**Initial State**: Clean Docker environment

**Validation**:
- `container_running`: name=env-demo
- `env_var_set`: container=env-demo, key=APP_ENV, value=production
- `env_var_set`: container=env-demo, key=APP_VERSION, value=1.0

**Hints**:
1. Use `-e` flag to set environment variables
2. `docker run -d --name env-demo -e APP_ENV=production -e APP_VERSION=1.0 alpine sleep 3600`
3. `docker run -d --name env-demo -e APP_ENV=production -e APP_VERSION=1.0 alpine sleep 3600`

---

## Level 6 — Stop and Remove
**Difficulty**: Easy | **XP**: 50

**Story**: Containers left running waste resources. Stop and remove the container named `old-service` to clean up the docks.

**Initial State**: Container `old-service` (nginx, running) pre-created

**Objectives**:
- Stop the container named `old-service`
- Remove the container named `old-service`

**Validation**:
- `container_not_exists`: name=old-service

**Hints**:
1. `docker stop <name>` stops a container; `docker rm <name>` removes it
2. Stop first, then remove: `docker stop old-service && docker rm old-service`
3. Or force remove in one step: `docker rm -f old-service`

---

## Level 7 — Exec Into a Container
**Difficulty**: Medium | **XP**: 100

**Story**: Something is wrong inside the `debug-box` container. Get a shell inside it and create a file `/tmp/mission-complete` to signal success.

**Initial State**: Container `debug-box` (ubuntu, running with `sleep 3600`) pre-created

**Objectives**:
- Exec into container `debug-box` and create file `/tmp/mission-complete`

**Validation**:
- `file_in_container`: container=debug-box, path=/tmp/mission-complete

**Hints**:
1. `docker exec -it <name> <command>` runs a command inside a running container
2. Use `docker exec debug-box touch /tmp/mission-complete` or exec a shell
3. `docker exec debug-box touch /tmp/mission-complete`

---

## Level 8 — Container Logs
**Difficulty**: Medium | **XP**: 100

**Story**: The `log-service` container is misbehaving. Read its logs to find the secret code it printed, then create a file `/tmp/found` inside it to confirm you found it.

**Initial State**:
- Container `log-service` (alpine, running) pre-created, it ran: `echo "SECRET_CODE=DOCKER42"` then `sleep 3600`

**Objectives**:
- Read the logs of `log-service`
- Create file `/tmp/found` inside `log-service`

**Validation**:
- `command_run`: docker logs log-service executed
- `file_in_container`: container=log-service, path=/tmp/found

**Hints**:
1. `docker logs <name>` prints the stdout/stderr of a container
2. After reading logs, exec in and create the file
3. `docker logs log-service` then `docker exec log-service touch /tmp/found`
