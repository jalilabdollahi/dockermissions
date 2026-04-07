# Module 02 — Images & Dockerfile

**Theme**: Building your own images
**Prerequisite**: Module 01
**Total Levels**: 8
**XP Available**: 650

---

## Level 1 — Pull an Image
**Difficulty**: Easy | **XP**: 50

**Story**: Before you can deploy, you need the right image. Pull `redis:7-alpine` from Docker Hub — lightweight and battle-tested.

**Objectives**:
- Pull image `redis:7-alpine` from Docker Hub

**Validation**:
- `image_exists`: name=redis, tag=7-alpine

**Hints**:
1. `docker pull <image>:<tag>` downloads an image
2. `docker pull redis:7-alpine`
3. `docker pull redis:7-alpine`

---

## Level 2 — List and Remove Images
**Difficulty**: Easy | **XP**: 50

**Story**: The local image store is cluttered with old images consuming disk space. Remove the image `busybox:latest` to free space.

**Initial State**: Image `busybox:latest` pre-pulled

**Objectives**:
- Remove image `busybox:latest`

**Validation**:
- `image_not_exists`: name=busybox, tag=latest

**Hints**:
1. `docker images` lists local images; `docker rmi <image>` removes one
2. `docker rmi busybox:latest`
3. `docker rmi busybox:latest`

---

## Level 3 — Your First Dockerfile
**Difficulty**: Easy | **XP**: 50

**Story**: It's time to build something. Create a Dockerfile that starts from `alpine:3.18`, sets maintainer label `maintainer=recruit`, and runs `echo "Mission Ready"` as the default command.

**Objectives**:
- Write a `Dockerfile` in `/workspace`
- Build it as image `mission-image:v1`

**Initial State**: `/workspace` directory exists and is empty

**Validation**:
- `image_exists`: name=mission-image, tag=v1
- `image_label`: image=mission-image:v1, key=maintainer, value=recruit

**Hints**:
1. A Dockerfile starts with `FROM`, then `LABEL`, then `CMD`
2. ```
   FROM alpine:3.18
   LABEL maintainer=recruit
   CMD ["echo", "Mission Ready"]
   ```
   Then: `docker build -t mission-image:v1 /workspace`
3. Write the Dockerfile above, then `docker build -t mission-image:v1 /workspace`

---

## Level 4 — ADD vs COPY
**Difficulty**: Medium | **XP**: 100

**Story**: Your app needs its source code inside the image. Use COPY to add `app.py` from the build context into `/app/app.py` in the image.

**Objectives**:
- Write a Dockerfile using `FROM python:3.11-alpine`, `COPY app.py /app/app.py`, `CMD ["python", "/app/app.py"]`
- Build as `pyapp:v1`

**Initial State**: `/workspace/app.py` pre-created with `print("hello docker")`

**Validation**:
- `image_exists`: name=pyapp, tag=v1
- `file_in_image`: image=pyapp:v1, path=/app/app.py

**Hints**:
1. `COPY <src> <dest>` copies files from build context to image
2. Dockerfile with FROM, COPY, CMD; build with `docker build -t pyapp:v1 /workspace`
3. Write the Dockerfile, then `docker build -t pyapp:v1 /workspace`

---

## Level 5 — RUN Commands
**Difficulty**: Medium | **XP**: 100

**Story**: A bare OS image needs software installed. Build an image based on `ubuntu:22.04` that has `curl` installed.

**Objectives**:
- Write a Dockerfile: `FROM ubuntu:22.04`, `RUN apt-get update && apt-get install -y curl`
- Build as `curl-box:v1`
- Verify: run a container from `curl-box:v1` and confirm `curl --version` works

**Initial State**: `/workspace` is empty

**Validation**:
- `image_exists`: name=curl-box, tag=v1
- `binary_in_image`: image=curl-box:v1, binary=curl

**Hints**:
1. `RUN` executes commands during image build
2. Chain commands with `&&` to minimize layers
3. `RUN apt-get update && apt-get install -y curl`

---

## Level 6 — ENV and WORKDIR
**Difficulty**: Medium | **XP**: 100

**Story**: Well-structured images define their working directory and bake in environment configuration. Build an image with `WORKDIR /app` and `ENV NODE_ENV=production`.

**Objectives**:
- Write a Dockerfile: `FROM node:18-alpine`, `WORKDIR /app`, `ENV NODE_ENV=production`, `CMD ["node", "-e", "console.log(process.env.NODE_ENV)"]`
- Build as `node-app:v1`

**Validation**:
- `image_exists`: name=node-app, tag=v1
- `env_var_in_image`: image=node-app:v1, key=NODE_ENV, value=production
- `workdir_in_image`: image=node-app:v1, path=/app

**Hints**:
1. `WORKDIR` sets the working directory; `ENV` sets environment variables
2. Both are Dockerfile instructions, one per line
3. Write the Dockerfile with all four instructions, then build

---

## Level 7 — Multi-Stage Build
**Difficulty**: Hard | **XP**: 200

**Story**: Bloated images are a security risk and waste bandwidth. Use a multi-stage build to compile a Go binary in one stage and copy only the binary into a minimal `scratch` or `alpine` final image.

**Objectives**:
- Write a multi-stage Dockerfile:
  - Stage 1 (`builder`): `FROM golang:1.21-alpine AS builder`, copy `main.go`, run `go build -o app .`
  - Stage 2: `FROM alpine:3.18`, `COPY --from=builder /build/app /app`, `CMD ["/app"]`
- Build as `go-app:v1`
- Final image size should be under 20MB

**Initial State**: `/workspace/main.go` pre-created (a simple Hello World Go program)

**Validation**:
- `image_exists`: name=go-app, tag=v1
- `image_size_under`: image=go-app:v1, max_mb=20
- Container runs successfully

**Hints**:
1. Multi-stage builds use multiple `FROM` lines; `COPY --from=<stage>` copies between stages
2. The builder stage has all dev tools; the final stage is lean
3. See the multi-stage Dockerfile structure in the objectives

---

## Level 8 — .dockerignore
**Difficulty**: Medium | **XP**: 100 (bonus)

**Story**: Your build context is huge because it includes `node_modules` and `.git`. Create a `.dockerignore` file to exclude them and speed up builds.

**Objectives**:
- Create `/workspace/.dockerignore` that excludes `node_modules` and `.git`
- Build image `clean-build:v1` from the existing Dockerfile in `/workspace`
- Verify the build context sent to daemon is under 1KB

**Initial State**: `/workspace` contains a Dockerfile, a small `index.js`, large `node_modules/` (fake, 100MB), `.git/`

**Validation**:
- `file_exists`: path=/workspace/.dockerignore
- `dockerignore_excludes`: entries=[node_modules, .git]
- `image_exists`: name=clean-build, tag=v1

**Hints**:
1. `.dockerignore` works like `.gitignore` — list patterns to exclude from build context
2. Add `node_modules` and `.git` on separate lines
3. Create `.dockerignore` with those two entries, then `docker build -t clean-build:v1 /workspace`
