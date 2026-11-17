# 0005 — Sign-in primarily through the host app

**Status:** accepted 2026-11-05

**Decision.** Order of support:
1. **Signed token** (HS256 JWT, `@ozvi/sdk` `signOzviToken`, with plan/MRR traits) — the simplest integration, no redirect.
2. **OIDC** with silent `prompt=none` (Apinido is already an OIDC provider through BetterAuth), several providers per project.
3. **Trusted header** (forward auth) for self-host behind a proxy.
4. **Ozvi account** in the cloud: a 6-digit code + magic link in one e-mail, an unfinished draft is kept; passkeys, Google/GitHub.

**Why.** The user should not have to create yet another account; today's `FIDER_SSO_URL` hack only works for one tier.
