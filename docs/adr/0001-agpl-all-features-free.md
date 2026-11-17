# 0001 — AGPL, all features in self-host

**Status:** accepted 2026-11-05; the licence was replaced by [0008](0008-fsl-source-available.md) (FSL instead of AGPL), the principle "all features in self-host" still applies

**Context.** Fider tried open-core and reverted it. Competitors (Canny, Featurebase) lock SSO and branding removal behind expensive plans; that is exactly what annoys integrators.

**Decision.** The whole server AGPL-3.0-only with no feature flags by plan. `packages/sdk` and `packages/widget` are MIT, because they run inside closed host apps. The cloud sells convenience (hosting, e-mails, domains, backups), not features.

**Consequences.** Monetisation only through the cloud; the price must be low and the value clear. AGPL prevents a competing SaaS built on our code without sharing the changes.
