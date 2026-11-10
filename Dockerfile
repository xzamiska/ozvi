# One image for self-host and cloud (ADR-0002). Build: docker build -t ozvi .
FROM node:22.23.4-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/theme/package.json packages/theme/
COPY packages/sdk/package.json packages/sdk/
COPY packages/widget/package.json packages/widget/
COPY packages/mcp/package.json packages/mcp/
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @ozvi/web build
# Self-contained migrator (drizzle + postgres bundled) so the runtime image needs no dev deps.
RUN pnpm --filter @ozvi/widget exec esbuild ../db/src/migrate.ts --bundle --platform=node --format=esm \
      --outfile=/app/migrate.mjs --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" \
 && pnpm --filter @ozvi/widget exec esbuild ../db/src/cli.ts --bundle --platform=node --format=esm \
      --outfile=/app/ozvi.mjs --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"

FROM node:22.23.4-alpine AS runtime
WORKDIR /app
# Release version shown in the admin and compared with the public release list (docs/SELFHOST.md → Aktualizácie).
ARG OZVI_VERSION=dev
# Builds of main for ozvi.io: the newest version whose release images exist (lib/releases.ts). Empty for releases.
ARG OZVI_RELEASED=
LABEL org.opencontainers.image.version=$OZVI_VERSION org.opencontainers.image.source=https://github.com/xzamiska/ozvi
ENV OZVI_VERSION=$OZVI_VERSION OZVI_RELEASED=$OZVI_RELEASED NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 OZVI_STORAGE_DIR=/data/uploads
RUN addgroup -S ozvi && adduser -S ozvi -G ozvi && mkdir -p /data/uploads && chown -R ozvi:ozvi /data
COPY --from=build --chown=ozvi:ozvi /app/apps/web/.next/standalone ./
COPY --from=build --chown=ozvi:ozvi /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=ozvi:ozvi /app/apps/web/public ./apps/web/public
# Ozvi's own release notes, served as /releases and /releases.json on ozvi.io (cloud mode).
COPY --from=build --chown=ozvi:ozvi /app/apps/web/releases ./apps/web/releases
COPY --from=build --chown=ozvi:ozvi /app/migrate.mjs /app/ozvi.mjs ./
COPY --from=build --chown=ozvi:ozvi /app/packages/db/migrations ./migrations
USER ozvi
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "OZVI_MIGRATIONS=/app/migrations node migrate.mjs && exec node apps/web/server.js"]
