# Module 05 — Docker Compose

**Theme**: Multi-container applications
**Prerequisite**: Module 04
**Total Levels**: 7
**XP Available**: 600

---

## Level 1 — Your First Compose File
**Difficulty**: Easy | **XP**: 50

**Story**: Running multi-container apps with `docker run` is painful. Docker Compose lets you define everything in one YAML file. Write a Compose file that runs a single `nginx` service.

**Objectives**:
- Write `/workspace/docker-compose.yml` with one service: `web` using image `nginx:latest`, no port mapping yet
- Run `docker compose up -d`
- Confirm service `web` is running

**Initial State**: `/workspace` is empty

**Validation**:
- `compose_service_running`: service=web, project=workspace

**Hints**:
1. A Compose file has a `services:` key at the top level
2. ```yaml
   services:
     web:
       image: nginx:latest
   ```
3. Write the file, then `docker compose -f /workspace/docker-compose.yml up -d`

---

## Level 2 — Multiple Services
**Difficulty**: Easy | **XP**: 50

**Story**: Real apps have multiple components. Define a Compose stack with a `web` (nginx) service and a `db` (postgres:15-alpine) service.

**Objectives**:
- Write a `docker-compose.yml` with services `web` (nginx) and `db` (postgres:15-alpine)
- Set required env var for postgres: `POSTGRES_PASSWORD=secret`
- Run `docker compose up -d`

**Validation**:
- `compose_service_running`: service=web
- `compose_service_running`: service=db
- `env_var_set`: container=*db*, key=POSTGRES_PASSWORD, value=secret

**Hints**:
1. Add multiple entries under `services:`
2. Use `environment:` key for env vars
3. ```yaml
   services:
     web:
       image: nginx:latest
     db:
       image: postgres:15-alpine
       environment:
         POSTGRES_PASSWORD: secret
   ```

---

## Level 3 — Port Mapping in Compose
**Difficulty**: Easy | **XP**: 50

**Story**: Expose the nginx service on host port 8080.

**Objectives**:
- Add `ports: ["8080:80"]` to the `web` service
- Restart the stack
- Confirm http://localhost:8080 responds

**Validation**:
- `port_exposed`: service=web, host_port=8080, container_port=80
- `http_responds`: url=http://localhost:8080, status=200

**Hints**:
1. Use `ports:` key under the service
2. Format: `"host:container"`
3. `ports: ["8080:80"]`

---

## Level 4 — Named Volumes in Compose
**Difficulty**: Medium | **XP**: 100

**Story**: Your Postgres data disappears on every `docker compose down`. Add a named volume `db-data` to persist it.

**Objectives**:
- Add a named volume `db-data` to the Compose file
- Mount it in the `db` service at `/var/lib/postgresql/data`
- Re-deploy the stack

**Validation**:
- `volume_exists`: name=*db-data*
- `volume_mounted`: service=db, volume=*db-data*, path=/var/lib/postgresql/data

**Hints**:
1. Define volumes at the top level `volumes:` and reference them in services
2. ```yaml
   volumes:
     db-data:
   services:
     db:
       volumes:
         - db-data:/var/lib/postgresql/data
   ```
3. Add both the top-level `volumes:` block and the service-level mount

---

## Level 5 — Custom Network in Compose
**Difficulty**: Medium | **XP**: 100

**Story**: By default Compose creates one network. Define a custom network `backend` and put the `db` on it. Put `web` on both `backend` and a `frontend` network.

**Objectives**:
- Define two networks: `frontend` and `backend`
- `web` service on both networks
- `db` service only on `backend` network

**Validation**:
- `network_exists`: name=*frontend*
- `network_exists`: name=*backend*
- `service_on_network`: service=web, network=frontend
- `service_on_network`: service=web, network=backend
- `service_on_network`: service=db, network=backend
- `service_not_on_network`: service=db, network=frontend

**Hints**:
1. Define networks at the top level `networks:` and reference under each service
2. A service can list multiple networks
3. Use `networks:` key both at the top level and under each service

---

## Level 6 — Health Checks and Depends_on
**Difficulty**: Hard | **XP**: 200

**Story**: The `web` service crashes on startup because `db` isn't ready. Use `depends_on` with a health check to make `web` wait for `db` to be healthy before starting.

**Objectives**:
- Add a `healthcheck` to the `db` service: `pg_isready -U postgres`
- Add `depends_on: db: condition: service_healthy` to the `web` service
- Redeploy and confirm `web` starts only after `db` is healthy

**Validation**:
- `service_has_healthcheck`: service=db
- `depends_on_healthy`: service=web, depends_on=db

**Hints**:
1. `healthcheck` has `test`, `interval`, `timeout`, `retries` keys
2. `depends_on` can take a `condition: service_healthy` qualifier
3. ```yaml
   healthcheck:
     test: ["CMD", "pg_isready", "-U", "postgres"]
     interval: 5s
     timeout: 3s
     retries: 5
   ```

---

## Level 7 — Scale a Service
**Difficulty**: Hard | **XP**: 200 (bonus)

**Story**: Traffic is spiking. Scale the `web` service to 3 replicas using Docker Compose.

**Objectives**:
- Scale the `web` service to 3 replicas
- Confirm 3 containers for the `web` service are running

**Validation**:
- `service_replicas`: service=web, count=3

**Hints**:
1. `docker compose up --scale web=3 -d` scales a service
2. Or add `deploy.replicas: 3` in the Compose file (requires Swarm or Compose v3 with deploy)
3. `docker compose up --scale web=3 -d`
