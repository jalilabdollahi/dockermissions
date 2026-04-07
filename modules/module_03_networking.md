# Module 03 — Docker Networking

**Theme**: Connecting containers
**Prerequisite**: Module 02
**Total Levels**: 7
**XP Available**: 600

---

## Level 1 — Default Bridge Network
**Difficulty**: Easy | **XP**: 50

**Story**: By default, containers join the `bridge` network. Run two alpine containers and observe that they can't resolve each other by name on the default bridge.

**Objectives**:
- Run container `alpha` from `alpine` (detached, `sleep 3600`)
- Run container `beta` from `alpine` (detached, `sleep 3600`)
- Try to ping `beta` from `alpha` — observe it fails (expected)
- Confirm both containers are on the `bridge` network

**Validation**:
- `container_running`: name=alpha
- `container_running`: name=beta
- `container_on_network`: container=alpha, network=bridge
- `container_on_network`: container=beta, network=bridge

**Hints**:
1. Default containers use the `bridge` network automatically
2. `docker run -d --name alpha alpine sleep 3600`
3. DNS-based name resolution only works on user-defined networks

---

## Level 2 — Create a Custom Network
**Difficulty**: Easy | **XP**: 50

**Story**: User-defined networks give you DNS resolution between containers. Create a network named `mission-net` of type `bridge`.

**Objectives**:
- Create a Docker network named `mission-net` with driver `bridge`

**Validation**:
- `network_exists`: name=mission-net, driver=bridge

**Hints**:
1. `docker network create <name>` creates a network
2. Use `--driver bridge` (bridge is the default anyway)
3. `docker network create --driver bridge mission-net`

---

## Level 3 — Connect Containers by Name
**Difficulty**: Easy | **XP**: 50

**Story**: Now that you have `mission-net`, connect two containers to it. They should be able to ping each other by name.

**Objectives**:
- Run container `server` from `nginx` (detached) on network `mission-net`
- Run container `client` from `alpine` (detached, `sleep 3600`) on network `mission-net`
- Exec into `client` and ping `server` by name (must succeed)

**Initial State**: `mission-net` network pre-created

**Validation**:
- `container_on_network`: container=server, network=mission-net
- `container_on_network`: container=client, network=mission-net
- `ping_succeeds`: from=client, to=server

**Hints**:
1. Use `--network <name>` when running containers
2. `docker run -d --name server --network mission-net nginx`
3. `docker exec client ping -c 1 server` should succeed

---

## Level 4 — Expose vs Publish
**Difficulty**: Medium | **XP**: 100

**Story**: `EXPOSE` in a Dockerfile is documentation only — it doesn't publish the port to the host. You must use `-p` to actually publish. Run nginx publishing port 9090 on the host.

**Objectives**:
- Run `nginx` container named `public-web` with host port `9090` mapped to container port `80`
- Confirm the port is reachable on `localhost:9090`

**Validation**:
- `container_running`: name=public-web
- `port_exposed`: container=public-web, host_port=9090, container_port=80
- `http_responds`: url=http://localhost:9090, status=200

**Hints**:
1. `-p <host>:<container>` publishes a port
2. `-p 9090:80`
3. `docker run -d --name public-web -p 9090:80 nginx`

---

## Level 5 — Host Network
**Difficulty**: Medium | **XP**: 100

**Story**: For maximum performance (no NAT), some containers run on the host network. Run a container using the `host` network driver and confirm it sees the host's network interfaces.

**Objectives**:
- Run container `host-mode` from `alpine` using `--network host` running `sleep 3600` (detached)
- Exec into it and run `ip addr` — confirm `eth0` or host interface is visible

**Validation**:
- `container_running`: name=host-mode
- `container_network_mode`: container=host-mode, mode=host

**Hints**:
1. `--network host` attaches container directly to host network
2. No port mapping needed or possible with host mode
3. `docker run -d --name host-mode --network host alpine sleep 3600`

---

## Level 6 — Connect Running Container to Network
**Difficulty**: Medium | **XP**: 100

**Story**: The container `late-joiner` is already running but needs to join `mission-net` without restarting. Connect it dynamically.

**Initial State**:
- Container `late-joiner` (alpine, running, `sleep 3600`) on default bridge
- Network `mission-net` exists

**Objectives**:
- Connect running container `late-joiner` to network `mission-net` without stopping it

**Validation**:
- `container_running`: name=late-joiner
- `container_on_network`: container=late-joiner, network=mission-net

**Hints**:
1. `docker network connect <network> <container>` attaches a running container
2. `docker network connect mission-net late-joiner`
3. `docker network connect mission-net late-joiner`

---

## Level 7 — Isolate with None Network
**Difficulty**: Hard | **XP**: 200

**Story**: Some workloads must be completely isolated with no network access. Run a container with no networking at all and confirm it cannot reach the outside world.

**Objectives**:
- Run container `isolated` from `alpine` with no network (`--network none`) running `sleep 3600`
- Confirm it has no network interfaces except `lo`

**Validation**:
- `container_running`: name=isolated
- `container_network_mode`: container=isolated, mode=none
- `no_external_network`: container=isolated

**Hints**:
1. `--network none` disables all networking
2. The container will only have the loopback `lo` interface
3. `docker run -d --name isolated --network none alpine sleep 3600`
