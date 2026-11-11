# DockerMissions sandbox: an isolated Docker engine (Docker-in-Docker) plus the
# tools a player needs in the terminal. Every mission runs against this inner
# engine, never against the host's Docker.
FROM docker:29-dind

RUN apk add --no-cache \
      bash bash-completion curl jq nano vim tree less tar gzip coreutils \
      findutils grep sed procps iproute2 bind-tools openssl \
 && mkdir -p /sessions /workspace /etc/dockermissions

ENV DOCKER_TLS_CERTDIR="" \
    DOCKER_HOST="unix:///var/run/docker.sock" \
    TERM=xterm-256color

COPY bashrc /etc/dockermissions/bashrc
COPY base-images /etc/dockermissions/base-images
COPY dm-reset dm-prefetch /usr/local/bin/

WORKDIR /
