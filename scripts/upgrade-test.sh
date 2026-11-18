#!/usr/bin/env bash
# Upgrade path (QA audit 17 Nov 2026): an instance on the last release, with real rows in it, migrates to this
# commit. Migrations were only ever run on an empty database; a NOT NULL column without a default or a broken
# backfill only fails on existing data. Database ozvi_upgrade, recreated on every run.
#   scripts/upgrade-test.sh [base tag]     (default: the newest v* tag)
# Local: needs `docker compose up`. CI: Postgres service on 5446 (UPGRADE_CI=1).
set -euo pipefail
cd "$(dirname "$0")/.."
base=${1:-$(git describe --tags --abbrev=0 --match 'v*')}
if [ "${UPGRADE_CI:-}" = "1" ]; then
  sql() { PGPASSWORD=postgres psql -h localhost -p 5446 -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
else
  sql() { docker compose exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
fi
url=postgres://ozvi:ozvi@localhost:5446/ozvi_upgrade
old=$(mktemp -d)
trap 'rm -rf "$old"' EXIT

sql -c "DROP DATABASE IF EXISTS ozvi_upgrade WITH (FORCE)" -c "CREATE DATABASE ozvi_upgrade OWNER ozvi"
sql -d ozvi_upgrade -c "CREATE EXTENSION IF NOT EXISTS vector"

# 1. The schema of the last release.
git archive "$base" packages/db/migrations | tar -x -C "$old"
DATABASE_URL=$url OZVI_MIGRATIONS="$old/packages/db/migrations" pnpm --silent --filter @ozvi/db migrate
echo "upgrade-test: $base schema ($(ls "$old/packages/db/migrations"/*.sql | wc -l | tr -d ' ') migrations)"

# 2. Rows like a running instance has: a workspace, a project, people, ideas and bugs, votes, comments, a status stop.
sql -d ozvi_upgrade <<'SQL'
SET ROLE ozvi;
SET ozvi.system = 'on';
INSERT INTO workspaces (id, slug, name) VALUES ('00000000-0000-4000-8000-000000000001', 'up', 'Upgrade');
INSERT INTO projects (id, workspace_id, slug, name, theme)
  VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'up', 'Upgrade', '{"name":"Ozvi","colors":{"accent":"#5A3FE6","ink":"#0D0C14","surface":"#FFFFFF","canvas":"#F7F7F9","border":"#E6E5EC"}}');
INSERT INTO users (id, project_id, external_id, email, name, role) VALUES
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'email:admin@up.test', 'admin@up.test', 'Admin', 'admin'),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'app-1', 'jana@up.test', 'Jana', 'member');
INSERT INTO items (id, project_id, kind, number, title, body, status, author_id) VALUES
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'idea', 1, 'Export do CSV', 'Prosím.', 'open', '00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002', 'bug', 2, 'Faktúra sa neuloží', '', 'new', '00000000-0000-4000-8000-000000000004');
INSERT INTO votes (project_id, item_id, user_id) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003');
INSERT INTO comments (project_id, item_id, author_id, body) VALUES
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', 'Pozrieme sa na to.'),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003', 'Opravujeme.');
INSERT INTO item_events (project_id, item_id, from_status, to_status) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000006', NULL, 'new');
SQL

# 3. This commit's migrations over that data.
DATABASE_URL=$url pnpm --silent --filter @ozvi/db migrate

# 4. The data is still there, readable through RLS as the app reads it.
sql -d ozvi_upgrade <<'SQL'
SET ROLE ozvi;
SET ozvi.project_id = '00000000-0000-4000-8000-000000000002';
DO $$
BEGIN
  IF (SELECT count(*) FROM items) <> 2 OR (SELECT count(*) FROM comments) <> 2 OR (SELECT count(*) FROM users) <> 2 OR (SELECT count(*) FROM votes) <> 1 THEN
    RAISE EXCEPTION 'upgrade-test: rows missing after the upgrade';
  END IF;
END $$;
SQL
echo "upgrade-test: $base → $(git describe --tags --always) with data: ok"
