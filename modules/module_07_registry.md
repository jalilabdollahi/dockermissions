# Module 07 — Registry & Distribution

**Theme**: Sharing images
**Prerequisite**: Module 06
**Total Levels**: 5
**XP Available**: 450

---

## Level 1 — Tag an Image
**Difficulty**: Easy | **XP**: 50

**Story**: Before pushing to a registry, images must be tagged with the destination. Tag the local image `myapp:latest` to target the local registry at `localhost:5000/myapp:v1`.

**Objectives**:
- Tag `myapp:latest` as `localhost:5000/myapp:v1`

**Initial State**: `myapp:latest` image pre-built

**Validation**:
- `image_exists`: name=localhost:5000/myapp, tag=v1

**Hints**:
1. `docker tag <source> <destination>` creates a new tag pointing to the same image
2. `docker tag myapp:latest localhost:5000/myapp:v1`
3. `docker tag myapp:latest localhost:5000/myapp:v1`

---

## Level 2 — Run a Local Registry
**Difficulty**: Easy | **XP**: 50

**Story**: You don't always need Docker Hub. Run a local Docker registry on port 5000.

**Objectives**:
- Run a local registry container named `registry` from `registry:2` on port 5000 (detached)

**Validation**:
- `container_running`: name=registry
- `port_exposed`: container=registry, host_port=5000, container_port=5000
- `http_responds`: url=http://localhost:5000/v2/, status=200

**Hints**:
1. The official `registry:2` image runs a Docker-compatible registry
2. `docker run -d --name registry -p 5000:5000 registry:2`
3. `docker run -d --name registry -p 5000:5000 registry:2`

---

## Level 3 — Push to Local Registry
**Difficulty**: Medium | **XP**: 100

**Story**: Your local registry is running. Push `localhost:5000/myapp:v1` to it.

**Objectives**:
- Push the image `localhost:5000/myapp:v1` to the local registry

**Initial State**:
- Local registry running on port 5000
- `localhost:5000/myapp:v1` image tagged locally

**Validation**:
- `image_in_registry`: registry=localhost:5000, name=myapp, tag=v1

**Hints**:
1. `docker push <image>` pushes to the registry encoded in the image name
2. `docker push localhost:5000/myapp:v1`
3. `docker push localhost:5000/myapp:v1`

---

## Level 4 — Pull from Local Registry
**Difficulty**: Medium | **XP**: 100

**Story**: The image was pushed. Now remove the local copy and re-pull it from the registry to prove the registry works.

**Objectives**:
- Remove local image `localhost:5000/myapp:v1`
- Pull it back from the registry
- Run a container from it to verify

**Validation**:
- `image_exists`: name=localhost:5000/myapp, tag=v1 (after pull)
- `container_ran`: image=localhost:5000/myapp:v1

**Hints**:
1. `docker rmi` removes local image; `docker pull` re-downloads
2. `docker rmi localhost:5000/myapp:v1 && docker pull localhost:5000/myapp:v1`
3. Then `docker run --rm localhost:5000/myapp:v1`

---

## Level 5 — Image Layers and History
**Difficulty**: Hard | **XP**: 200

**Story**: Every Dockerfile instruction adds a layer. Understanding layers helps you optimize images. Inspect the layer history of `myapp:v1` and rebuild with optimized layers (fewer RUN commands merged).

**Objectives**:
- Run `docker history myapp:v1` to see all layers
- Identify layers that can be merged (multiple consecutive `RUN` commands)
- Edit `/workspace/Dockerfile` to merge the RUN commands
- Build `myapp:v2` and confirm it has fewer layers than `myapp:v1`

**Initial State**:
- `myapp:v1` pre-built with at least 3 separate `RUN apt-get ...` instructions
- `/workspace/Dockerfile` editable

**Validation**:
- `image_exists`: name=myapp, tag=v2
- `fewer_layers`: image_a=myapp:v2, image_b=myapp:v1

**Hints**:
1. `docker history <image>` shows all layers and their sizes
2. Merge multiple `RUN` commands with `&&` to reduce layer count
3. ```dockerfile
   RUN apt-get update && apt-get install -y curl wget git && rm -rf /var/lib/apt/lists/*
   ```
