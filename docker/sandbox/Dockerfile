FROM docker:27-dind

RUN apk add --no-cache bash curl git nodejs npm python3

RUN dockerd-entrypoint.sh & \
    sleep 5 && \
    docker pull nginx:latest && \
    docker pull alpine:3.18 && \
    docker pull redis:7-alpine && \
    docker pull ubuntu:22.04 && \
    docker pull node:18-alpine && \
    kill %1

