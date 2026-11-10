# Rozhodnutia (ADR)

| # | Rozhodnutie | Dátum |
|---|---|---|
| [0001](0001-agpl-all-features-free.md) | Self-host má všetky funkcie; SDK a widget MIT (licenciu servera nahradilo 0008) | 2026-11-05 |
| [0002](0002-one-image-two-modes.md) | Jeden image pre self-host aj cloud (`OZVI_MODE`) | 2026-11-05 |
| [0003](0003-postgres-only.md) | Len Postgres (Drizzle, pgvector), žiadny Redis; joby viď 0007 | 2026-11-05 |
| [0004](0004-project-scoped-tenancy.md) | `project_id` na každej tenant tabuľke, RLS | 2026-11-05 |
| [0005](0005-host-app-auth-first.md) | Prihlásenie primárne cez hostiteľskú appku | 2026-11-05 |
| [0006](0006-pricing-creem-quarterly.md) | Creem, len štvrťročne/ročne, limity len na prílohy a e-maily | 2026-11-05 |
| [0007](0007-email-outbox-table.md) | E-maily cez outbox tabuľku (namiesto pg-boss) | 2026-11-05 |
| [0008](0008-fsl-source-available.md) | Licencia FSL-1.1-ALv2 namiesto AGPL (kód verejný, bez konkurenčného SaaS, po 2 rokoch Apache 2.0) | 2026-11-07 |
| [0009](0009-releases-registry-updater.md) | Vydania tagom na súkromný ghcr.io, zoznam vydaní na ozvi.io, voliteľný updater so zálohou a návratom | 2026-11-09 |
| [0010](0010-boards-never-indexed.md) | Boardy sa nikdy neindexujú (bez nastavenia); indexuje sa len web Ozvi v cloude | 2026-11-10 |
