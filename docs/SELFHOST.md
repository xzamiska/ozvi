# Self-hosting Ozvi

> Slovak version: [SELFHOST.sk.md](SELFHOST.sk.md). This English guide is the main one.

Two containers: Postgres 17 and Ozvi (plus an optional updater, see [Updates](#updates)). Put a TLS proxy (Caddy, Traefik) in front of port 3000. By default the port only listens on the same machine (`OZVI_BIND=127.0.0.1`); if the proxy runs elsewhere, set `OZVI_BIND` to an address the proxy can reach. Without a proxy (`OZVI_BIND=0.0.0.0`) also set `OZVI_TRUSTED_PROXIES=0`, otherwise clients can fake their IP address and get around rate limits.

```sh
cd deploy
cp .env.example .env          # fill in the passwords and PUBLIC_URL
docker compose up -d          # migrations run on start
docker compose exec ozvi node ozvi.mjs project:create myapp "My app" --origin https://app.example.com
```

- **The app's Postgres role is not a superuser** (`deploy/initdb/01-ozvi.sh`). A superuser would bypass row-level security; in that case `/api/health` returns 500 with `"rls":"bypassed"`.
- **E-mail: you bring the SMTP.** Ozvi does not send through us; set `SMTP_URL` to your own server or any service with SMTP:

  | Service | `SMTP_URL` |
  |---|---|
  | Resend | `smtp://resend:<API_KEY>@smtp.resend.com:587` |
  | Postmark | `smtp://<TOKEN>:<TOKEN>@smtp.postmarkapp.com:587` |
  | Amazon SES | `smtp://<USER>:<PASS>@email-smtp.eu-central-1.amazonaws.com:587` |
  | Brevo | `smtp://<LOGIN>:<KEY>@smtp-relay.brevo.com:587` |
  | Your own server | `smtp://user:pass@mail.example.com:587` (or `smtps://…:465`) |

  **Ecomail** (API only, no SMTP): set `ECOMAIL_API_KEY` instead of `SMTP_URL` (paid account, verified sender domain). Click and open tracking are off; the API does not allow custom headers, so `List-Unsubscribe` is missing and the unsubscribe link stays in the footer of every e-mail.

  `OZVI_MAIL_FROM` must be an address on a domain verified with the service (SPF + DKIM), or the e-mails end up in spam. The sender is shown as the project name ("Billiwo" &lt;feedback@billiwo.com&gt;). Without `SMTP_URL` the app still works; notifications are logged as `skipped` and the settings say so. Self-hosted servers have no e-mail limit.
- **Attachments:** the `uploads` volume (`/data/uploads`), or S3-compatible storage through `S3_*`.
- **Keys:** `OZVI_SECRET_KEY` encrypts SSO secrets in the database. If you lose it, generate new secrets for your projects in their settings. `OZVI_SESSION_SECRET` signs cookies and the unsubscribe links in e-mails.
- **Proxy:** `OZVI_TRUSTED_PROXIES` = the number of proxies in front of Ozvi (default 1). Rate limits take the IP from `X-Forwarded-For` only from them, not from whatever the client sends. **Ozvi without a proxy (port open to the internet) must have `OZVI_TRUSTED_PROXIES=0`**, otherwise a client can fake its IP and get around the limits on sign-in, the widget and the API. When Ozvi expects a proxy but a public request arrives without `X-Forwarded-For`, it logs it once (`[ozvi] A request arrived without X-Forwarded-For…`).
- **Backups:** `pg_dump` of the database plus the `uploads` volume.
- **AI helper (optional):** discussion summaries, changelog drafts, the weekly digest, post translation. The output is always a draft that a person approves ([AI.md](AI.md)). Any provider:

  | Provider | Settings |
  |---|---|
  | OpenAI | `OZVI_AI_PROVIDER=openai` `OZVI_AI_API_KEY=sk-…` `OZVI_AI_MODEL=gpt-4o-mini` |
  | Mistral (EU) | `OZVI_AI_PROVIDER=openai` `OZVI_AI_BASE_URL=https://api.mistral.ai/v1` `OZVI_AI_API_KEY=…` `OZVI_AI_MODEL=mistral-small-latest` |
  | Ollama (local, no key) | `OZVI_AI_PROVIDER=openai` `OZVI_AI_BASE_URL=http://ollama:11434/v1` `OZVI_AI_MODEL=qwen2.5:14b` |
  | Azure OpenAI, OpenRouter, Groq, vLLM, LM Studio | `OZVI_AI_PROVIDER=openai` + their `/v1` address, key and model |
  | Anthropic (Claude) | `OZVI_AI_PROVIDER=anthropic` `OZVI_AI_API_KEY=sk-ant-…` (model `claude-opus-5-5` by default, or `OZVI_AI_MODEL`) |

  `OZVI_AI_MODEL_FAST` = an optional cheaper model for translations. The older `ANTHROPIC_API_KEY` still works as `anthropic`. Without these settings (or with `OZVI_AI_PROVIDER=off`) the app runs without AI. With `openai` the model must at least return JSON; structured output (`json_schema`) is used when the server supports it. List the provider as a sub-processor in your privacy policy (not needed for a local model).
- **AI duplicates (optional):** `OZVI_EMBEDDINGS_URL` + `OZVI_EMBEDDINGS_MODEL` (+ `OZVI_EMBEDDINGS_KEY`): any API compatible with OpenAI `/embeddings` (OpenAI, Ollama, LM Studio, vLLM). With `OZVI_AI_PROVIDER=openai`, `OZVI_EMBEDDINGS_MODEL` is enough (the address and key are reused). The worker indexes items in the background; without it, duplicates are found by fuzzy text matching (pg_trgm). The `vector` extension is created by the `initdb` script; if it is missing, embeddings are skipped.
  - **Local model instead of an API:** `OZVI_EMBEDDINGS=local` runs a small multilingual model (multilingual-e5-small, quantized, 384 dimensions) inside Ozvi on WebAssembly, so it works on the Alpine image. No text leaves the server and there is nothing to pay per call. It takes precedence over `OZVI_EMBEDDINGS_URL`/`_MODEL`.

    | Variable | Meaning |
    |---|---|
    | `OZVI_EMBEDDINGS=local` | turn the local model on |
    | `OZVI_MODELS_DIR` | where the model is kept; default `models` next to the attachments folder (`/data/models` in Docker, on the same volume) |
    | `OZVI_MODELS_PREFETCH=1` | download and load the model at start instead of on first use |
    | `OZVI_EMBEDDINGS_THREADS` | WebAssembly threads for the model (default 1; 2–4 make long texts 2–3× faster on a multi-core server) |

    The first use downloads ~135 MB from `huggingface.co` (a pinned revision); later starts load it from disk in about a second. Plan for **about 1 GB of extra RAM** (the model and its tokenizer stay in memory). Until the model is loaded, suggestions use text matching. Switching between the local model and an API re-indexes items by itself (vectors are kept per model).
  - **Which method works better on your data:** `docker compose exec ozvi node ozvi.mjs duplicates:eval --project <slug> [--method trigram|api|local|all] [--json]` measures, on the items your team merged, how often each method finds the original (recall@1/@3, precision and recall per threshold). It prints numbers only, never titles or texts. `--method api` needs `OZVI_EMBEDDINGS_URL` and `OZVI_EMBEDDINGS_MODEL`.
- <a id="github"></a>**GitHub (optional):** easiest through your own GitHub App. A board admin then just clicks Connect GitHub, installs the app on the chosen repositories and picks one in Ozvi, with no token and no webhook to set up ([ADR-0011](adr/0011-github-app.md)). You create the app with one confirmation on GitHub:

  ```
  node scripts/create-github-app.mjs --url https://feedback.example.com [--org your-organisation]
  ```

  The script writes `OZVI_GITHUB_APP_*` to `github-app.env`. Add those lines to `.env` and restart Ozvi. The server must be reachable from the internet (GitHub webhooks). Without the app, GitHub is connected with a fine-grained token and a webhook in the project settings.
- **Webhooks:** on a self-hosted server they may point into your internal network (Mattermost, n8n on the LAN); in cloud mode (`OZVI_MODE=cloud`) internal addresses are blocked.
- **Managing projects in `/app` (optional):** `OZVI_ADMIN_EMAILS=you@example.com`: these addresses sign in to `/app` with a code, see every project, create new ones and open their settings in one click. Without it, projects are created with the CLI command.
- **E-mail sign-in on the board:** Settings → Project → "E-mail sign-in" (for people without an account in your app). Needs `SMTP_URL`.
- **Fonts (GDPR):** visitors' browsers never load fonts from Google. Ozvi downloads the theme's font (Google Fonts) once on the server and then serves it itself from `/fonts/css` and `/fonts/file/…` (long cache, `immutable`); Ozvi's own fonts (Geist, Geist Mono) are in the image. Only families from the catalogue (`FONT_CATALOGUE` in `@ozvi/theme`) and families saved in some project's theme are allowed, so it is not an open proxy.
  - The cache lives on disk in `OZVI_FONTS_DIR` (by default `fonts` next to the attachments folder, `/data/fonts` in Docker, so on the same volume) and in memory.
  - The server needs outgoing HTTPS to `fonts.googleapis.com` and `fonts.gstatic.com` only the first time a font is used. If Google is unreachable, nothing breaks: the theme's system font is used.
  - `OZVI_FONTS_PREFETCH=1` downloads the whole catalogue in the background on start (~10 MB). After that you can set `OZVI_FONTS_REMOTE=0`: Ozvi never contacts Google and serves only what is on disk (otherwise the system font). For a fully offline install, run once with prefetch and keep the `fonts` folder.
  - The font source "Custom" in the theme means your app loads the font itself; Ozvi does not download it.
- **GDPR and your privacy policy:** on your own server you are the controller and need no DPA with Ozvi's authors. Your contracts are with your hosting, e-mail service, AI provider and integrations. Ready-made wording for your privacy policy, based on your configuration, is in Settings → Project data → "Text for your privacy policy"; the checklist is in [PRIVACY-KIT](PRIVACY-KIT.md).
- **Developer sign-in** (`/dev/login`, `/demo`) only works with `pnpm dev` and `OZVI_DEV_LOGIN=1`; it cannot be turned on in the production image or in cloud mode.

## Updates

Ozvi ships versioned releases (semver) with notes at [ozvi.io/releases](https://ozvi.io/releases). You decide when your server changes: by hand, with a button in the admin, or automatically at night.

### Images and access

- The images are public, no sign-in needed: `ghcr.io/xzamiska/ozvi` (the app) and `ghcr.io/xzamiska/ozvi-updater` (the optional updater), for `amd64` and `arm64`.
- If you mirror them to your own private registry, set `OZVI_REGISTRY`, `OZVI_REGISTRY_USER` and `OZVI_REGISTRY_TOKEN` for the updater.
- Tags: `1.4.2` (an exact version, never changes), `1.4` (fixes only), `1` (fixes and new features, nothing breaking), `latest` (everything, including 2.0).
- The default is `OZVI_IMAGE=ghcr.io/xzamiska/ozvi:1`. Breaking changes only come with `:2` and need you to change the tag yourself.

### New version notice

The board settings show the running version. Once a day they compare it with the public release list (`OZVI_RELEASES_URL`, by default `https://ozvi.io/releases.json`). It is a plain GET and nothing about your instance is sent. Turn it off with `OZVI_UPDATE_CHECK=0`.

### Server errors to your own GlitchTip or Sentry (optional)

If you run GlitchTip or Sentry, set `OZVI_ERROR_DSN` to the project's DSN. Ozvi sends server errors there (rendering, API, actions, background jobs): the type, message, stack, method and path without the query string. Never headers, cookies, request bodies or user data. Without the variable nothing is sent.

### Heartbeat for an uptime monitor (optional)

Set `OZVI_HEARTBEAT_URL` to the address of your uptime monitor's heartbeat (GlitchTip Heartbeat, Uptime Kuma Push, healthchecks.io). Ozvi calls it (POST) every minute, but only while the database answers and no e-mail has been stuck in the queue for more than 15 minutes. When the beats stop, the monitor alerts you. Nothing about the instance is sent; without the variable it is off. To check reachability from outside (DNS, TLS, proxy), use a monitor that runs somewhere other than the Ozvi server, for example `GET /api/health`.

### Anonymous statistics (opt-in, off by default)

Ozvi sends nothing about your instance without your consent. If you want to help us know how many people run Ozvi on their own servers, set `OZVI_TELEMETRY=1`. Once a day the server then sends exactly this to `https://ozvi.io/api/telemetry` (`OZVI_TELEMETRY_URL`):

| Field | Meaning |
|---|---|
| `instance` | 32 characters: a one-way hash of your `OZVI_SECRET_KEY`. It stays the same, but reveals neither the key nor anything else. |
| `version` | the running Ozvi version |
| `projects` | number of projects (boards) |
| `users` | number of board users |
| `activeUsers30` | of those, active in the last 30 days |
| `items` | number of items (ideas and reports) |
| `items30` | of those, from the last 30 days |

Names, e-mail addresses, URLs, project names and content are never sent. Ozvi.io keeps one row per instance with the latest counts and the date of the last report. Turn it off by removing the variable; we delete your row on request (support@ozvi.io). Decision: [ADR-0012](adr/0012-opt-in-telemetry.md).

### Updating by hand

1. Back up the database: `docker compose exec postgres pg_dump -U postgres -Fc ozvi > ozvi-$(date +%F).dump`.
2. Run `docker compose pull && docker compose up -d`.
3. Database migrations run on start. If they fail, the container does not start.

### Updater (optional)

A small `ozvi-updater` container next to Ozvi. The admin gets an **Updates** section with a mode:

| Mode | What it does |
|---|---|
| Notify only | Shows the new version in the admin. Changes nothing. |
| On request (default) | An "Update to X.Y.Z" button in the admin. |
| Automatic | Installs fixes and minor versions in the night window (`OZVI_UPDATE_WINDOW`, by default 02:00–05:00 in `TZ`). Never installs a new major version or a release marked as breaking by itself. Does not retry a version that failed once. |

Every update:
1. backs up the database to `./backups` (`pg_dump`, keeps the last 5); without a backup it changes nothing,
2. pulls the new image (`docker compose pull ozvi`) and starts it (`docker compose up -d ozvi`),
3. waits until `/api/health` answers and the new version runs (at most 3 minutes),
4. if not, stops it, restores the database from the backup and starts the previous image,
5. writes the result to the history in the admin, and also sends an e-mail if the update was rolled back or failed.

A new version or a successful update sends no e-mail; it only shows in the admin.

Turning it on in `.env` (see `deploy/.env.example`):

```sh
COMPOSE_PROFILES=updater
OZVI_UPDATER_URL=http://updater:8787
OZVI_UPDATER_TOKEN=…                # openssl rand -hex 32
OZVI_ADMIN_EMAILS=you@example.com   # who gets the e-mail when an update fails
```

then `docker compose up -d`.

- **Security:** the updater needs the Docker socket, which in practice is full control over the server. That is why it only runs with the `updater` profile, has no public port, accepts commands only from Ozvi with a shared token, and only changes the `ozvi` service of its own compose project. If you don't want to give it that access, stay with updating by hand.
- **Everything in `.env`:** the updater runs `docker compose` in the project folder with only its `.env`, not with the variables from your shell. Everything compose needs must therefore be in `.env`.
- **A manual `docker compose up -d` after an update** may restart Ozvi once (a few seconds) if the server has a different Docker Compose version than the updater. Neither the image nor the data change.
- **Project folder:** the updater sees it at the same path as the host (`OZVI_DIR`, by default `$PWD` when compose starts). If you start compose some other way (systemd, Portainer), set `OZVI_DIR` to the absolute path.
- **Recovery when the rollback fails too** (e-mail "Ozvi update failed, check the server"):
  1. `docker compose stop ozvi`
  2. `docker compose exec postgres psql -U postgres -c 'DROP DATABASE ozvi WITH (FORCE)' -c 'CREATE DATABASE ozvi OWNER ozvi'`
  3. `docker compose exec -T postgres pg_restore -U postgres -d ozvi < backups/<file>.dump`
  4. In `.env`, set `OZVI_IMAGE` to the previous exact version (e.g. `ghcr.io/xzamiska/ozvi:1.4.2`) and run `docker compose up -d`.

### Going back to an older version

Set the previous exact version in `OZVI_IMAGE` and restore the backup from before the update (steps above). Migrations only go forward, so going back does not work without restoring the backup.
