# 0003 — Postgres only

**Status:** accepted 2026-11-05

**Decision.** Postgres 17 is the only service: Drizzle for the schema, jobs through tables in Postgres (e-mails: ADR-0007; pg-boss only once more types are added), pgvector for duplicates, full-text for search. No Redis.

**Why.** Self-host = `docker compose up` with two containers. At our load (≈0.02 req/s per 1,000 users) Redis would not speed anything up.
