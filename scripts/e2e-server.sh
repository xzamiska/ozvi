#!/usr/bin/env bash
# Throwaway Ozvi cloud for the browser regression tests (apps/e2e): its own database ozvi_e2e, recreated on
# every run, a production build (no dev hot reload) on http://e2e.localhost:3410, e-mails into Mailpit.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${E2E_CI:-}" = "1" ]; then
  # GitHub Actions: Postgres and Mailpit are service containers on the same ports as docker compose.
  psql() { PGPASSWORD=postgres command psql -h localhost -p 5446 -U postgres "$@"; }
else
  docker compose up -d --wait >/dev/null
  psql() { docker compose exec -T postgres psql -U postgres "$@"; }
fi
psql -qc "DROP DATABASE IF EXISTS ozvi_e2e WITH (FORCE)" >/dev/null
psql -qc "CREATE DATABASE ozvi_e2e OWNER ozvi" >/dev/null
psql -d ozvi_e2e -qc "CREATE EXTENSION IF NOT EXISTS vector" >/dev/null

export OZVI_MODE=cloud PUBLIC_URL=http://e2e.localhost:3410 OZVI_CLOUD_DOMAIN=e2e.localhost
export DATABASE_URL=postgres://ozvi:ozvi@localhost:5446/ozvi_e2e OZVI_STORAGE_DIR=./data/uploads-e2e
export SMTP_URL=smtp://localhost:1046 OZVI_MAIL_FROM=noreply@e2e.localhost
export OZVI_SECRET_KEY=e2e-only-secret-key-0123456789abcdef0123 OZVI_SESSION_SECRET=e2e-only-session-secret-0123456789abcdef
# Simulated payments (lib/dev-flags.ts allows them in this production build because PUBLIC_URL is *.localhost).
# DNS stays real: the domain specs check the unverified path (records to set, a failing "Overiť doménu").
export OZVI_DEV_LOGIN=0 OZVI_DEV_BILLING=1 OZVI_DEV_DNS=0 OZVI_SIGNUP=open OZVI_ADMIN_EMAILS=operator@e2e.test
export OZVI_NEXT_DIST=.next-e2e NODE_OPTIONS= OZVI_FREE_WORKSPACES_PER_IP=10000 OZVI_LOGIN_PER_IP=10000
rm -rf data/uploads-e2e
pnpm --filter @ozvi/db migrate >/dev/null
pnpm --filter @ozvi/widget build >/dev/null
# Rebuild only when the web sources changed since the last e2e build (saves minutes on reruns).
stamp=apps/web/.next-e2e/.e2e-src
src=$(git ls-files -s apps/web packages | git hash-object --stdin; git diff HEAD -- apps/web packages | git hash-object --stdin)
if [ ! -f "$stamp" ] || [ "$(cat "$stamp")" != "$src" ]; then
  (cd apps/web && npx next build >/dev/null) && echo "$src" > "$stamp"
fi
cd apps/web && exec npx next start -p 3410
