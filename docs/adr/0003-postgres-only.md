# 0003 — Len Postgres

**Stav:** prijaté 2026-11-05

**Rozhodnutie.** Postgres 17 je jediná služba: Drizzle na schému, joby cez tabuľky v Postgrese (e-maily: ADR-0007; pg-boss až keď pribudnú ďalšie typy), pgvector na duplicity, full-text na vyhľadávanie. Žiadny Redis.

**Prečo.** Self-host = `docker compose up` s dvoma kontajnermi. Pri našej záťaži (≈0,02 req/s na 1 000 používateľov) Redis nič nezrýchli.
