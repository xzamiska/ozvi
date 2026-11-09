# 0004 — Tenancy cez project_id a RLS

**Stav:** prijaté 2026-11-05 (RLS politiky sa zavedú v F1 pred prvým cudzím tenantom)

**Rozhodnutie.** Workspace → projekt → všetko ostatné. Každá tenant tabuľka má priamy `project_id` (aj tam, kde by stačil join), aby jedna politika `project_id = current_setting('ozvi.project_id')::uuid` pokryla všetko. Request nastaví `set_config` v transakcii. Používatelia sú per projekt (`unique(project_id, external_id)`), nikdy sa nespájajú len podľa e-mailu.

**Prečo.** Fider v0.37 opravoval cross-tenant prevzatie loginu. Druhá vrstva v DB je lacná poistka.

**Hotové (F1):** `project_id` a politika `tenant` na `users`, `items`, `votes`, `comments`, `attachments`, `emails`; FORCE RLS; rola appky bez superuser/BYPASSRLS (kontroluje `/api/health`); testy v `packages/db/src/rls.test.ts`. `projects` a `workspaces` RLS nemajú (lookup podľa slugu/domény) — každý update na nich musí mať `where id = …`.
