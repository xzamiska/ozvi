# Cloud mode (ozvi.io)

The same image as self-host, just with `OZVI_MODE=cloud`. What this turns on:

- **Landing page** at `/` and **sign-up** at `/app` (a code or a link sent by e-mail, no password). Every new account gets a workspace on the Free plan.
- **Console** `/app/w/<id>`: Overview, Team, Plan & usage (cloud only), Delivery (a log of the `emails` and `webhook_deliveries` tables across projects), Activity (the `activity` table: invitations, roles, plan, domains, tokens, webhooks, OIDC, theme). The console is in self-host too, except for the plan.
- **Plans** (`packages/db/src/plans.ts`): Free 1 project, Pro 3, Studio unlimited; e-mails, attachments, custom domain, the "Ozvi" badge and AI (embeddings) depend on the plan. MCP, GitHub, webhooks and SSO/OIDC are in all plans (ADR-0001).
- **Webhooks and OIDC** must not point into the internal network (also checked at DNS lookup).

Trying out the whole cloud locally: [CLOUD-LOCAL.md](CLOUD-LOCAL.md).

## Variables

| Variable | Meaning |
|---|---|
| `OZVI_MODE=cloud` | cloud behaviour |
| `PUBLIC_URL=https://ozvi.io` | primary address (board `ozvi.io/<slug>`, `/app`) |
| `OZVI_CLOUD_DOMAIN=ozvi.io` | projects also answer on `<slug>.ozvi.io` |
| `OZVI_CNAME_TARGET=domains.ozvi.io` | where customers point the CNAME of their custom domain |
| `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_TEST=1` | payments; webhook URL `https://ozvi.io/api/creem` |
| `CREEM_PRODUCT_PRO_YEAR`, `…_PRO_QUARTER`, `…_STUDIO_YEAR`, `…_STUDIO_QUARTER` | product ids in Creem |
| `SMTP_URL`, `OZVI_MAIL_FROM` | our Resend (sign-in codes and notifications); in the cloud we send the e-mails, which is why the plans limit them. Alternative: `ECOMAIL_API_KEY` |

## Deployment

Edge Caddy, staging and live on one VM, on-demand certificates for `<project>.ozvi.io` and custom domains, staging behind basic auth: [deploy/cloud](../deploy/cloud/README.md). `/api/domains/ask` answers 200 only for verified custom domains of projects whose plan includes them, and for existing `<slug>.<OZVI_CLOUD_DOMAIN>`.

## Payments (Creem)

1. In Creem, create 4 products (Pro/Studio × year/quarter, prices from `PRICES`), subscriptions, no monthly ones.
2. Webhook `https://ozvi.io/api/creem`, events `checkout.completed` and `subscription.*`.
3. The plan changes **only** from a verified webhook. A plan change during an active subscription goes through the customer portal (no second subscription).
4. When a subscription expires: the workspace drops to Free, custom domains are removed (they have to be verified again after an upgrade), projects and data are not deleted — only new ones over the limit cannot be created.

## Migrating an existing self-host project to the cloud (e.g. Billiwo)

1. In the cloud, create an account and a project with the same slug (`billiwo`).
2. Import from Fider the same way as for self-host (`import:fider --project billiwo`) — run it against the cloud DB from the operator container.
3. Settings → Custom domain `feedback.billiwo.com` → CNAME to `OZVI_CNAME_TARGET` → Verify domain.
4. In the app, replace `OZVI_URL` and `OZVI_SSO_SECRET` (a new secret from Settings).
