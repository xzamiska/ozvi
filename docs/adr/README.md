# Decisions (ADR)

| # | Decision | Date |
|---|---|---|
| [0001](0001-agpl-all-features-free.md) | Self-host has all features; SDK and widget MIT (the server licence was replaced by 0008) | 2026-11-05 |
| [0002](0002-one-image-two-modes.md) | One image for both self-host and cloud (`OZVI_MODE`) | 2026-11-05 |
| [0003](0003-postgres-only.md) | Postgres only (Drizzle, pgvector), no Redis; for jobs see 0007 | 2026-11-05 |
| [0004](0004-project-scoped-tenancy.md) | `project_id` on every tenant table, RLS | 2026-11-05 |
| [0005](0005-host-app-auth-first.md) | Sign-in primarily through the host app | 2026-11-05 |
| [0006](0006-pricing-creem-quarterly.md) | Creem, quarterly/yearly only, limits only on attachments and e-mails | 2026-11-05 |
| [0007](0007-email-outbox-table.md) | E-mails through an outbox table (instead of pg-boss) | 2026-11-05 |
| [0008](0008-fsl-source-available.md) | FSL-1.1-ALv2 licence instead of AGPL (public code, no competing SaaS, Apache 2.0 after 2 years) | 2026-11-07 |
| [0009](0009-releases-registry-updater.md) | Releases by tag to a private ghcr.io, release list on ozvi.io, optional updater with backup and rollback | 2026-11-09 |
| [0010](0010-boards-never-indexed.md) | Boards are never indexed (no setting); only the Ozvi website in the cloud is indexed | 2026-11-10 |
| [0011](0011-github-app.md) | GitHub through a GitHub App (no token and no manual webhook); the token stays as a fallback | 2026-11-11 |
| [0012](0012-opt-in-telemetry.md) | Anonymous statistics from self-host only with consent (`OZVI_TELEMETRY=1`), seven fields, nothing about content | 2026-11-12 |
| [0013](0013-screenshot-privacy-by-default.md) | The screenshot by default covers fields, e-mails, phone numbers, cards and tokens with a solid rectangle in a copy of the page; `mask: "all"` for sensitive apps | 2026-11-12 |
| [0014](0014-widget-email-verification.md) | The widget works without host-app sign-in: the person verifies an e-mail code inside the widget (amends 0005) | 2026-11-18 |
