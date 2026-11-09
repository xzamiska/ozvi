# Contributing

Thanks for helping! Issues and pull requests are welcome.

1. `pnpm install && cp .env.example .env && pnpm dev` — Postgres and Mailpit run in Docker, the board on http://localhost:3300 (`/dev/login?project=billiwo&as=team`).
2. Read [CLAUDE.md](CLAUDE.md) — the project's non-negotiable rules (RLS on every tenant table, theme tokens instead of raw colours, untrusted user text, widget under 20 kB, self-host gets every feature).
3. `pnpm typecheck && pnpm test` must pass. Database changes: edit `packages/db/src/schema.ts`, then `pnpm db:generate`; new tenant tables need an RLS migration like `0006_rls_f2.sql`.
4. UI copy lives in `apps/web/messages/{sk,cs,en,pl,hu,de}.json` (next-intl); Slovak is the source, every key must exist in all six (a test checks it). Native-speaker fixes for Polish, Hungarian and German are very welcome ([docs/LANGUAGES.md](docs/LANGUAGES.md)). Code, comments and commits are English, conventional commits.

By contributing you agree that your contribution is licensed under the project licence, FSL-1.1-ALv2 (MIT for `packages/sdk` and `packages/widget`).
