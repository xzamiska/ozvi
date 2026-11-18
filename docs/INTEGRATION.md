# Integrating with the host app (SSO token)

Users are signed in to Ozvi automatically from your app. No OAuth, no second account.

## 0. Without any backend: the widget with e-mail verification

You can start with the widget alone, before writing any backend code. Add the `<script>` and the `<ozvi-widget>` tag
(see the project settings → "Embed code"), put your app's address into **Allowed origins** and keep **Sign-in by e-mail** on
(on by default in the cloud). When someone sends a report, an idea or a vote, the widget asks for their e-mail and the
6-digit code we send, right inside the widget; what they wrote stays and is sent right after. From then on they are the
same person as on the board: they see "My reports" and get the e-mails about the fix. ([ADR-0014](adr/0014-widget-email-verification.md))

- The widget remembers the verification for 30 days in your domain's `localStorage` (`ozvi:wt:<Ozvi host>/<project>`).
  `Ozvi.logout()` removes it; "Sign out everywhere" on the board, deleting the account or turning e-mail sign-in off end it on the server.
- Nothing is stored for a person who has not verified the code: no report, no screenshot, no account.
- The team sees the person's e-mail, but no name, plan or MRR. For those, and to skip the code, add the SSO token below;
  a token from your app always wins over the e-mail verification.

## 1. Backend: sign the token

```ts
import { signOzviToken } from "@ozvi/sdk"; // MIT, no dependencies

const token = signOzviToken(
  {
    id: user.id,                 // stable id in YOUR system
    email: user.email,
    name: user.name,
    role: user.isStaff ? "team" : "member", // "team" = triage and internal notes
    traits: { company: org.name, companyId: org.id, plan: org.plan, mrr: org.mrrCents, currency: "EUR" },
  },
  process.env.OZVI_SSO_SECRET!,   // ≥ 32 characters, the same as in the Ozvi project
);
```

The token is valid for 10 minutes. Create it every time feedback is opened, not once at login. Ozvi rejects a token without
`iat` or with a validity longer than an hour (`exp` − `iat` > 3600 s); sign-in then fails as with an invalid token.

The optional `locale` (`sk`, `cs`, `en`, `pl`, `hu`, `de`) sets the user's board language if the board offers it;
otherwise we ignore it.

### Customer data (`traits`)

Optional. **Only the team** sees them (never the public or other users): in the idea detail under "Who wants it" (company, plan, MRR
and the total "4 companies want it · 1,240 € MRR in total"), in the idea list as the "By MRR" sort and a filter by plan, and in MCP
(`get_item`, `top_requests` with `sort: "mrr"`) only for tokens with the `triage` scope.

| Property | Type | Meaning |
|---|---|---|
| `company` | string | Name of the customer's company |
| `companyId` | string | Stable company id; people with the same one count as one company (otherwise by name) |
| `plan` | string | Plan in your app (`free`, `pro`…) |
| `mrr` | integer | Monthly revenue from the company **in cents** (2900 = 29 €); a company counts once, with the highest MRR |
| `currency` | string | ISO 4217 code for `mrr`, `EUR` by default |

Missing properties are fine ("no customer data" is shown). We store at most 30 properties, scalar values, texts up to 200
characters. A token without `traits` keeps the stored data; an empty object `{}` deletes it. The data is part of the GDPR export
("My data", project export) and is deleted when the user is deleted.

## 2. Links from the app

| Action | URL |
|---|---|
| Ideas | `https://feedback.billiwo.com/billiwo/sso?token=…&return=/billiwo/ideas` |
| Report a bug with context | `…/sso?token=…&return=/billiwo/new%3Fkind%3Dbug%26url%3D%2Finvoices%2F12%26v%3D2.15.0` |
| My reports | `…/sso?token=…&return=/billiwo/bugs` |

`return` must start with `/<project>/` and, after resolving `..` (also `%2e%2e`), must stay under `/<project>/`; anything else
redirects to the board home `/<project>` (protection against open redirects).

## 3. Returning after sign-in

If the project has `login_url` set, a visitor who is not signed in gets a "Sign in" link to
`<login_url>?ozvi_return=/billiwo/ideas`. After sign-in, your app redirects to
`/billiwo/sso?token=…&return=<ozvi_return>`.

## 4. Widget in the app: JavaScript API, roadmap and updates

In detail (in English, for developers of the host app): [`packages/widget/README.md`](../packages/widget/README.md). A demo of
everything is at `/demo` (only with `OZVI_DEV_LOGIN=1`).

- **`window.Ozvi`** controls the widget from your own buttons: `Ozvi.open("ideas" | "idea" | "bug" | "mine")`, `close`, `toggle`,
  `prefill({ title, body, kind })`, `identify(token)` / `logout()`, `setTraits`, `setLanguage`, events
  `open`, `close`, `submit`, `submitted {number, url, pending}`, `error` (`Ozvi.on`, or DOM events `ozvi:<name>`).
  Calls made before `widget.js` loads are caught by a short "stub" snippet and run once it has loaded.
- **Ideas right in the widget**: top ideas with search, voting (the server enforces both importance mode and the vote budget),
  a new idea with similar ideas shown while typing and a notice that it is waiting for approval. Voting does not subscribe to e-mails.
- **Embedded elements** `<ozvi-roadmap project="…">` and `<ozvi-changelog project="…" mode="badge">` (latest entries,
  a "What's new" badge with the unread count, stored only in the browser's `localStorage`). Public boards allow them
  to be embedded on any website (read-only); boards with private ideas only with a token from allowed origins.
- **npm**: `@ozvi/widget` (ESM), `@ozvi/widget/react` (`OzviWidget`, `OzviRoadmap`, `OzviChangelog`, `useOzvi`,
  `useOzviEvent`), `@ozvi/widget/vue` (plugin, components, composables), with types. Safe for SSR / Next.js.
- **Privacy in screenshots**: the image is drawn from a copy of the page that the widget edits first (the page the person
  sees does not change). Always fully masked: form field values, e-mails, phone numbers, IBANs, card numbers and tokens in text,
  and whole `data-ozvi-mask` elements. We cannot recognise names, notes or amounts: mark them with `data-ozvi-mask`. For sensitive
  apps, `OzviConfig.mask = "all"` masks all text and images except `data-ozvi-unmask`. When the copy cannot be masked,
  the report is sent without a screenshot, never with an unmasked one.
- **Strict CSP with nonce**: the nonce from the widget's `<script>` is passed to all scripts and styles the widget adds (including
  the screenshot). The required directives are in the README.
- Budget: the initial `widget.js` ≤ 20 kB gzip (test `packages/widget/src/size.test.ts`); ideas and embedded elements
  load only when used.

API for the widget (CORS: the project's allowed origins may send `Authorization: Bearer <SSO token>`, others read only
public data): `GET /<project>/api/widget/ideas?q=&limit=`, `POST /<project>/api/widget/vote` `{id, weight}`,
`GET /<project>/api/widget/roadmap?limit=`, `GET /<project>/api/widget/changelog?limit=`,
`POST /<project>/api/widget/login` (`{email}` sends a code, `{email, code}` returns a widget token; only with e-mail sign-in on).

## Security

- The secret is stored encrypted in Ozvi (AES-256-GCM, `OZVI_SECRET_KEY`).
- Users are per project and keyed by `id`, never by e-mail alone.
- **One person, one account.** If someone also signs in to the board with an e-mail code, they are merged with the app user with the same e-mail only when the app sends `emailVerified: true` in the token (it has verified the address). Accounts with the team or admin role are never merged automatically, so an admin account from the console stays separate from the app account. Without `emailVerified` the accounts stay separate: otherwise anyone could register someone else's e-mail in your app and take over that person's account on the board.
- The session cookie is `httpOnly`, `SameSite=Lax` and limited to the path `/<project>`.
- **Cookies and the widget:** the widget sets no cookies (neither in the cloud nor on your own server) and signs in to Ozvi with a token in a header, not a cookie. It sends cookies only to your `token-url` (your own). In your domain's `localStorage` it remembers the date of the last seen update (`ozvi:seen:…`), for the "new" badge, and, only after an e-mail verification in the widget (section 0), its token (`ozvi:wt:…`, 30 days). Fonts come from Ozvi, not from Google; the widget calls no third parties. A session cookie exists only on the board itself after sign-in.

## Roles

- `role` in the token (`member`/`team`/`admin`) is the source of truth: it overwrites the role in Ozvi at every sign-in. When someone loses a role, their other sessions in Ozvi are revoked immediately.
- Without `role` in the token, the admin manages roles in Ozvi (Settings → People). That is also where "Sign out everywhere" is: it revokes that person's sessions and API tokens right away.

## Alternative: OIDC

If the app (or company) has an identity provider (Keycloak, Authentik, Zitadel, Auth0, Google…), set it up in Settings → Sign-in with OIDC.
Redirect URI: `https://<ozvi>/<project>/oidc/callback`. `sub` becomes the user id. If you used Fider with the same provider before, imported people keep their history. We do not take roles from the provider (with some providers, users can edit them themselves); you set them in Ozvi → People. Note: changing the issuer later matches accounts by the new provider's `sub`.

## GitHub

Settings → GitHub: repository `owner/name` + a fine-grained token (only that repository, **Issues: Read and write**). Then in the repository, Settings → Webhooks:
URL `https://<ozvi>/<project>/api/github`, `application/json`, the secret from Ozvi, events **Issues**, **Pull requests** and **Releases**.

- In the report detail: "Link" an existing issue (`#12`, `owner/repo#12` or a link) or "Create issue". Only the title, description and app version go to GitHub.
- Issue closed as *completed* → after the next **published release**, the bug gets the status "Fixed in version `<tag>`" and the reporter an e-mail with a "Confirm the fix" button; linked ideas move to "Shipped" (the author and commenters get the usual e-mail, voters only from the published update). Projects without releases choose "Mark as fixed right away".
- **Update draft from a release:** a release that fixed or shipped something creates an update draft (title from the tag, list of ideas with links, bug fixes only as a count, because reports are private). With AI (a plan with AI, self-host with `OZVI_AI_PROVIDER` set), an AI model rewrites the text after GitHub responds, if nobody has edited it in the meantime. **It is never published on its own**: the team gets the e-mail "Update draft for vX is waiting for approval" and sees the draft in What's new. Only publishing sends voters one e-mail. Repeated delivery of the same release duplicates nothing.
- **Proof of fix:** merged PRs are attached to items named by an `Ozvi: #12, #13` line, or whose linked issue they close (`Fixes #40`, `closes owner/repo#41`). An `Ozvi-Preview: https://…` line adds a preview link. The team can also add a PR or preview by hand (detail → Proof of fix), MCP through `set_status` (`pullRequests`, `previewUrl`). On the move to "Fixed"/"Shipped", the proof (PR with title, release, preview) is saved with the stop on the route and reaches the reporter in the "does it work for you?" e-mail. On public ideas, only the team sees PRs (the repo may be private); everyone else sees the preview and release.
- **Shipped but not announced:** What's new (team only) and the Monday digest show shipped ideas and fixed bugs that no published update mentions yet.

## Linear

Settings → Integrations → Linear. Connected through a **personal API key** (Linear → Settings → Security & access → Personal API keys), stored encrypted like other secrets. A Linear OAuth app would need a registered app and a public callback address for every instance (self-host), so for now it is a key; ideally a service account's key.

1. Paste the key → "Connect Linear" → pick the **team** → save. A workspace admin's key creates the webhook in Linear by itself (`webhookCreate`, *Issues* events, our signing secret); otherwise the address `https://<ozvi>/<project>/api/linear` is shown with steps to add it by hand, and you paste the signing secret from Linear into Ozvi. Locally (`localhost`) Linear cannot call you: the Ozvi → Linear direction works, Linear → Ozvi only on a public address.
2. **Status mapping:** each team workflow state → an Ozvi stop. Defaults: Backlog/Todo → Planned (idea) / Confirmed (bug), In Progress → In progress, Done → Shipped / Fixed, Canceled/Duplicate → Declined / Won't fix, Triage → ignore. In the other direction, the first state in workflow order mapped to the stop is used.
3. **Options:** "Move the issue when the stage changes in Ozvi" (both ways, on by default) and mirroring comments from Ozvi to Linear: off / public / public and internal notes (only for a tracker that customers do not see). Comments from Linear do not go to Ozvi.
4. "Test connection" checks the key and reloads the states (the mapping of existing states stays). "Disconnect" also deletes the webhook we created; links on items stay.

In the item detail (team): "Link" an existing issue (`ENG-123` or a Linear link, only from the connected team) or "Create in Linear". The issue gets the title and description **cleaned as for GitHub** (an origin header: trust level and source, never a name; a quote without hidden content, `@mentions` inactive), a link to the item and the app version, never the console or screenshots.

**Linear → Ozvi:** a webhook signed with the `Linear-Signature` header (hex HMAC-SHA256 of the body) and a `webhookTimestamp` at most a minute old (replay protection). A state change moves the item through the usual `changeStatus`: the author and commenters get the usual e-mail, **voters nothing** (they learn from the published update), and an internal note "Linear ENG-12 moved to state …" is added to the thread. On the move to a state mapped to Shipped/Fixed, pull requests attached to the issue (GitHub, GitLab – added by Linear's integration) are saved as **proof of fix**.

**No ping-pong:** (1) a change that came from the tracker runs in the context of this link and the queue does not send it back; (2) the link remembers the last seen state (`item_links.sync.stateId`), a repeated webhook with the same state does nothing; (3) it also remembers what Ozvi sent (`pushedStateId`, 15 min) – the echo of our own move is ignored, and the queue sends nothing if the issue is already in the target stop.

## Jira Cloud

Settings → Integrations → Jira Cloud: the address (`yourcompany.atlassian.net`; we accept **only** `https://<name>.atlassian.net`, nothing else is called – SSRF protection), the Atlassian account e-mail and an **API token** (id.atlassian.com → Security → API tokens; ideally a service account with access to one project, with permissions to browse, create, transition and comment). Then the project and issue type for new issues. Mapping, comment mirroring, test and disconnect as for Linear; the default mapping goes by status category (To Do → Planned/Confirmed, In Progress → In progress, Done → Shipped/Fixed, states named like *Won't Do*, *Cancelled*, *Rejected*, *Duplicate* → Declined/Won't fix).

- The issue is created with a description in ADF (Atlassian Document Format): text from users is literal text, it cannot turn into a link or formatting; hidden characters and HTML comments are removed. Label `ozvi`.
- Ozvi → Jira: Jira has no "set status", so the workflow transition that leads to the target state is used. If there is no such transition from the current state, the attempt is retried and then given up (visible in `tracker_syncs.last_error`).
- **Jira → Ozvi, two options:**
  - **Webhook** (immediate): a Jira administrator creates a webhook in Settings → System → WebHooks with the address `https://<ozvi>/<project>/api/jira`, the *Secret* field from the screen shown when connecting (header `X-Hub-Signature: sha256=<hex>`), JQL `project = KĽÚČ`, events *Issue updated* and *Issue deleted*. System webhooks require Jira administrator rights (dynamic webhooks through REST are only for Connect/OAuth apps). Lost secret: "Generate new secret".
  - **Check every 5 minutes** (no admin rights): a job for linked issues calls `POST /rest/api/3/search/jql` (`key in (…)`, 50 at a time) and uses state changes since the last seen one the same way as the webhook.
- Proof of fix: the issue's remote links to GitHub PRs / GitLab MRs. Jira does not publicly document the data from the "Development" panel (dev-status API), so we do not use it.

The Ozvi → Linear/Jira queue is the `tracker_syncs` table (an outbox in the same transaction as the change, a job every 5 s, retries after 1, 4, 9, 16, 25 min), with RLS like the other tenant tables.

## Webhooks

Settings → Webhooks. Events: `item.created`, `item.status_changed` (on "Fixed"/"Shipped" with `proof: { prs, release, preview }`), `comment.created`, `item.merged`, `item.linked`, `changelog.published` (`entry` with ideas, without bugs, and `ai`), `item.tags_changed` (public tags only; `tagsChange: { previous, added, removed }`, a change to team tags does not trigger the event). Bug reports are sent only if you turn that on (they are private), internal comments never.

Text origin: `item.author` and `comment.author` = `{ name, trust }`, where `trust` is `anonymous` | `email_verified` | `sso_customer` | `team` | `system` (an idea that Ozvi created from customer feedback through MCP `submit_insight`; on the board "From customer feedback", the customer is only a voter, visible only to the team), and `source` = `board` | `widget` | `mcp` | `import` | `api`. Treat text from unverified authors (especially with an AI agent) as untrusted.

- **Chat message** (text in the board's default language, the same choice of events):
  - **Slack** format `{ text }`: Slack, Mattermost, Rocket.Chat (also Discord with `…/slack` at the end of the URL).
  - **Microsoft Teams:** in the channel, Workflows → the template "Send webhook alerts to a channel" (trigger *When a Teams webhook request is received*), and paste its URL into Ozvi; the old *Incoming Webhook* works too. An Adaptive Card (version 1.4) arrives with the project name, a sentence about the event, a quote of the comment and an "Open in Ozvi" button. Text from users cannot insert a link.
  - **Discord:** Channel settings → Integrations → Webhooks → URL. An embed arrives (colour by stop, link to the item, footer with the project); `allowed_mentions` is empty and `@` is broken up, so neither `@everyone` nor role mentions ping anyone.
- **Signed JSON:** header `Ozvi-Signature: t=<unix>,v1=<hex>`, where `v1 = HMAC-SHA256(secret, "<t>.<body>")`. Verification:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
const [, t, v1] = /t=(\d+),v1=([0-9a-f]+)/.exec(req.headers["ozvi-signature"]) ?? [];
const ok = Math.abs(Date.now() / 1000 - Number(t)) < 300 &&
  timingSafeEqual(Buffer.from(v1, "hex"), createHmac("sha256", secret).update(`${t}.${rawBody}`).digest());
```

AI labelling: `changelog.published` carries `ai: { generated: false }` or `{ generated: true, model, reviewedBy, reviewedAt }`; MCP (`list_updates`, `find_duplicates`) and the project export have the same field. Rules: [AI.md](AI.md).

Failed deliveries are retried (1, 4, 9, 16, 25 min), then given up; the number of failures in the last 7 days is shown in Settings.

## MCP (AI assistants)

**Connector (OAuth, no token):** in Claude.ai / ChatGPT, add a custom connector with the address `https://<ozvi>/<project>/mcp`. The app introduces itself with its own description (Client ID Metadata Document; older clients still register through DCR) and on the consent screen you see its verified domain; the user signs in to the board (SSO from the app, OIDC or e-mail) and chooses the permission. Access lasts an hour and is renewed; you revoke it in My API tokens.


**Personal token (headless agents, CI; in self-host and in the cloud):** Avatar → My API tokens → token (read / write / triage) → `claude mcp add --transport http ozvi https://<ozvi>/<project>/mcp --header "Authorization: Bearer ozvi_pat_…"`. The `/<project>/mcp` address also works on the board's custom domain and cloud subdomain; `/mcp` only on the instance's main address.

**Lockdown mode:** Settings → Integrations → API tokens and MCP → "Lockdown mode", or for a single connection the header `X-Ozvi-Lockdown: 1` (verified authors) / `team` (team only). Posts below the level arrive without title and text (`withheld: true`).

**Export to GitHub:** an issue created from a post carries an origin header (trust level, source, never a name), the text is in a quote and stripped of hidden content (HTML comments and HTML, invisible and bidi characters, Unicode tags, link definitions); `@mentions` are inactive. This protects coding agents that read the issue (GitLost-style attacks).
Tools and rules: [`packages/mcp/README.md`](../packages/mcp/README.md).
