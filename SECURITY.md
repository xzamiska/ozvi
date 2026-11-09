# Security

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository, or by e-mail to **security@ozvi.io**. Do not open a public issue.

We aim to answer within 3 working days and to ship a fix for confirmed high-severity issues within 14 days. Credit is given in the release notes unless you prefer otherwise.

## Design notes for reviewers

- Tenant isolation is enforced by Postgres row-level security (`FORCE`) on every tenant table; the app role is not a superuser and `/api/health` fails if RLS is bypassed (ADR-0004).
- Bug reports are private to the reporter and the project team, everywhere: board, MCP, webhooks (opt-in), similar-item search, exports.
- Secrets at rest (SSO, OIDC, GitHub, webhooks) are AES-256-GCM encrypted with `OZVI_SECRET_KEY`; API and OAuth tokens and sign-in codes are stored only as hashes.
- Text written by end users is untrusted for AI as well: MCP tools and AI prompts receive it fenced as data, destructive MCP tools need a confirmation code, AI output is shown to the team only.
- Outbound requests to admin-chosen URLs (webhooks, OIDC) go through `safeFetch`: no redirects, and in cloud mode no internal addresses, checked at connection time.
