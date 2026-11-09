#!/usr/bin/env bash
# Local cloud mode on http://ozvi.localhost:3400 — see docs/CLOUD-LOKALNE.md.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
[ -f .env.cloud ] || cp .env.cloud.example .env.cloud

docker compose up -d --wait
# Own database, so the self-mode dev data (pnpm dev) stays as it is.
if ! docker compose exec -T postgres psql -U postgres -tAc "select 1 from pg_database where datname = 'ozvi_cloud'" | grep -q 1; then
  docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE ozvi_cloud OWNER ozvi" >/dev/null
  docker compose exec -T postgres psql -U postgres -d ozvi_cloud -c "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null
  echo "created database ozvi_cloud"
fi

set -a; source .env; source .env.cloud; set +a
pnpm --filter @ozvi/db migrate
pnpm --filter @ozvi/widget build >/dev/null
echo "Ozvi cloud: ${PUBLIC_URL}  ·  e-maily: http://localhost:8046"
exec pnpm --filter @ozvi/web exec next dev -p "${OZVI_DEV_PORT:-3400}"
