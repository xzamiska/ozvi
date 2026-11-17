# 0004 — Tenancy through project_id and RLS

**Status:** accepted 2026-11-05 (RLS policies will be introduced in F1 before the first external tenant)

**Decision.** Workspace → project → everything else. Every tenant table has a direct `project_id` (even where a join would do), so that one policy `project_id = current_setting('ozvi.project_id')::uuid` covers everything. The request sets `set_config` in the transaction. Users are per project (`unique(project_id, external_id)`), never merged by e-mail alone.

**Why.** Fider v0.37 fixed a cross-tenant login takeover. A second layer in the DB is cheap insurance.

**Done (F1):** `project_id` and the `tenant` policy on `users`, `items`, `votes`, `comments`, `attachments`, `emails`; FORCE RLS; the app role without superuser/BYPASSRLS (checked by `/api/health`); tests in `packages/db/src/rls.test.ts`. `projects` and `workspaces` have no RLS (lookup by slug/domain) — every update on them must have `where id = …`.
