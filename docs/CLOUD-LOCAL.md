# Cloud locally

Cloud mode (sign-up, workspaces, people, plans, payments, subdomains, custom domains) can be tried out in full on your own computer, without a Creem account and without DNS.

```bash
pnpm dev:cloud
```

The `scripts/dev-cloud.sh` script:

- starts Docker (Postgres and Mailpit),
- creates a separate `ozvi_cloud` database, so the data from `pnpm dev` stays unchanged,
- runs the migrations and the web app on **http://ozvi.localhost:3400**.

It can run alongside self mode (`pnpm dev` on :3300). Settings are in `.env.cloud`, which is created from `.env.cloud.example` on the first run and overrides values from `.env`.

Browser: **Chrome or Firefox**. `*.localhost` addresses point to your computer without any system changes. Safari doesn't recognise them.

## What to try where

| What | How |
|---|---|
| Sign-up and sign-in | http://ozvi.localhost:3400/app/login, any e-mail (e.g. `ja@firma.test`). Both the code and the link are in **Mailpit: http://localhost:8046** |
| Project | After signing in, “Welcome to Ozvi” → name and address. The board is at `ozvi.localhost:3400/<slug>` and also at **`<slug>.ozvi.localhost:3400`** |
| Console | After signing in, `/app` opens the workspace console: **Overview** (projects with counts of new bugs, ideas and comments, plan usage, recent activity), **Team**, **Plan & usage**, **Delivery** (log of e-mails and webhooks, “Problems only” filter), **Activity** (who changed what). From a board you get back via “My projects” in the header |
| Sample data | `pnpm db:demo:cloud [slug]` fills a project (`fakturnik` by default) with users, ideas, bugs, comments, e-mails (including an undelivered one), webhook calls and activity. It runs only against `ozvi_cloud` and only once per project |
| People in the workspace | Console → **Team** → invite an e-mail. The invitation arrives in Mailpit. After clicking the link you are signed in as the invited person. Also try roles, removal and “Leave workspace” |
| Payments | Console → **Plan & usage** → “Upgrade to Pro” opens a **payment gateway simulation** instead of Creem. The buttons send made-up events through the same code as the real webhook: payment, renewal, failed payment, cancellation at the end of the period, expiry |
| Custom domain | On Pro: project settings → Custom domain, e.g. `feedback.mojafirma.localhost`. DNS verification is simulated (`OZVI_DEV_DNS=1`). Chrome sends `*.localhost` domains to 127.0.0.1 by itself, so the board runs straight away at http://feedback.mojafirma.localhost:3400. Any other domain (e.g. `.test`) needs a line in `/etc/hosts`, otherwise you can't open the board from the console |
| My account | Menu at the top right → My account: name, changing the e-mail (the link goes to the new address), sign out everywhere, closing the account |
| Legal texts | http://ozvi.localhost:3400/terms and `/privacy` (drafts; fill in the operator's details in `apps/web/src/lib/legal.ts`) |
| AI (Studio) | Add `OZVI_AI_PROVIDER=anthropic` and `OZVI_AI_API_KEY` to `.env.cloud`, then switch to Studio through the simulation |

## Real Creem sandbox instead of the simulation

In `.env.cloud` set:

- `OZVI_DEV_BILLING=0`,
- `CREEM_TEST=1`,
- `CREEM_API_KEY` and `CREEM_WEBHOOK_SECRET`,
- the product ids `CREEM_PRODUCT_*`.

The webhook from Creem has to reach your computer, for example through `cloudflared tunnel --url http://localhost:3400`. The webhook URL in Creem is then `<tunnel>/api/creem`.

## From scratch

```bash
pnpm db:reset:cloud   # drops the ozvi_cloud database
pnpm dev:cloud        # creates it again
```

The payment and DNS simulation works only outside production (`NODE_ENV !== "production"`). Not even a set variable turns it on in the production image.
