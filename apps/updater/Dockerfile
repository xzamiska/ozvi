# ozvi-updater (optional self-host sidecar). Build from the repo root:
#   docker build -f apps/updater/Dockerfile -t ozvi-updater .
FROM node:22.23.4-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/updater/package.json apps/updater/
RUN pnpm install --frozen-lockfile --filter @ozvi/updater...
COPY apps/updater apps/updater
RUN pnpm --filter @ozvi/updater build

FROM node:22.23.4-alpine
# docker CLI + compose plugin drive the operator's compose project; the Postgres 17 client takes the backup.
RUN apk add --no-cache docker-cli docker-cli-compose postgresql17-client tzdata
ARG OZVI_VERSION=dev
LABEL org.opencontainers.image.version=$OZVI_VERSION org.opencontainers.image.source=https://github.com/xzamiska/ozvi \
      org.opencontainers.image.description="Optional updater for self-hosted Ozvi"
ENV OZVI_VERSION=$OZVI_VERSION NODE_ENV=production PORT=8787
WORKDIR /app
COPY --from=build /app/apps/updater/dist/updater.mjs ./
VOLUME ["/state", "/backups"]
EXPOSE 8787
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
# Absolute: compose sets working_dir to the operator's project directory.
CMD ["node", "/app/updater.mjs"]
