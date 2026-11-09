# @ozvi/mcp

MCP tools served by the web app at `/mcp` (Streamable HTTP, stateless JSON) — same code in cloud and self-host.
The web app implements `Backend` (`apps/web/src/lib/mcp-backend.ts`); this package owns the tool contract.

**Auth:** personal access tokens `ozvi_pat_<project>_…` (Ozvi → avatar → Moje API tokeny). Scopes:

| Scope | Tools |
|---|---|
| `read` | `search_feedback`, `get_item`, `top_requests`, `summarize`, `find_duplicates`, `find_similar`, `list_tags`, `list_updates` |
| `write` | + `create_item` (returns likely duplicates in `similar`), `add_comment` |
| `triage` (team only) | + `set_status`, `set_tags`, `link_issue`, `merge_items`*, `publish_update`*, `publish_draft`*, `list_updates` with `drafts: true`, `submit_insight`, internal comments |

Effective scope = token scope capped by the owner's current role. Members see ideas and their own bugs only.
\* `merge_items`, `publish_update` and `publish_draft` are two-step: the first call returns a preview and a confirmation code (10 min, bound to the arguments and the token); only the second call with that code merges.

User-submitted text is always returned inside `<ozvi_data>` with `<` escaped, preceded by a note that it is data, not instructions.

**Provenance.** Every item and comment carries `author: { name, trust }` and `source`:
`trust` = `anonymous` (no account, imported people, customers named by an agent) | `email_verified` (signed in with an
e-mailed code) | `sso_customer` (signed in through the host app or OIDC) | `team` | `system` (ideas Ozvi filed from
customer feedback via `submit_insight`: no person is the author; passes lockdown `verified`, withheld under `team`); `source` = `board` | `widget` | `mcp` |
`import` | `api`. Webhook payloads carry the same fields.

**Lockdown** (modelled on GitHub MCP lockdown). The project setting (admin → Integrácie → API tokeny a MCP) or a
connection's own `X-Ozvi-Lockdown` header (or `?lockdown=`) — `1`/`verified`: only text from verified authors
(`email_verified`, `sso_customer`, `team`); `team`: only the team's. The stricter of the two applies. Withheld items keep
number, status, votes and author; title, body, attachments and bug context are replaced and `withheld: true` is set;
withheld comments lose their body.

**Release loop.** A GitHub release drafts a changelog entry (never published automatically). `list_updates` returns
entries (drafts for the team) with `ai`; `publish_draft` publishes a draft as it is (preview + code bound to the draft's
version; the token's owner becomes the reviewer). `set_status` takes proof of a fix — `pullRequests` (URLs) and
`previewUrl` — which the reporter sees in the "fixed" e-mail; `get_item` returns `proof: { prs, release, preview }`.

**AI label** (EU AI Act art. 50): machine-made content carries `ai: { generated: true, model, reviewedBy }` —
changelog entries written with AI (`reviewedBy` = who published it, `null` for drafts) and `find_duplicates` results
scored by an embeddings model. `ai: null` = written by people. Never present AI text as the team's own.

**`find_similar`** — text → closest ideas/bugs with a score 0–1 (embeddings when configured, otherwise trigram); call it
before `create_item` / `submit_insight`.

**`submit_insight`** (triage) — a support/call/chat/review snippet with `source`, optional `sourceRef` and
`customer { email, company, name }`. With `match` (or similarity ≥ 0.85 on the title) it adds the customer's vote and an
internal note (quote + provenance) to that idea; otherwise it creates a new idea that **waits in the moderation queue**
(never public before the team approves it). The new idea has a **system author** (`authorId` null, `context.insight`,
`author.trust: "system"`), shown on the board as "Zo spätnej väzby zákazníkov" / "From customer feedback" with a neutral
mark; the customer is only a voter, visible to the team in "Kto to chce", never as the author. The note with the quote
stays internal. The customer is matched by e-mail to a known board user; an unknown e-mail becomes an unverified contact
(`trust: anonymous`, opted out of all e-mails). Approval is logged in the activity log under the approving team member.

```sh
claude mcp add --transport http ozvi https://feedback.billiwo.com/billiwo/mcp --header "Authorization: Bearer ozvi_pat_…"
# optional: --header "X-Ozvi-Lockdown: 1"
```

### OAuth (connectors in Claude.ai, ChatGPT, …)

Each board is its own OAuth 2.1 authorization server: connect a client to `https://<ozvi>/<project>/mcp` and it
discovers everything from the 401. Implements the [MCP authorization spec 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization):

| Piece | Where |
|---|---|
| Protected resource metadata (RFC 9728) | `/.well-known/oauth-protected-resource/<project>/mcp`, linked from `WWW-Authenticate` |
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server/<project>` (also `/<project>/.well-known/…`) |
| **Client ID Metadata Documents** (preferred) | `client_id_metadata_document_supported: true`; `client_id` = https URL of the client's JSON document |
| Dynamic client registration (RFC 7591, **legacy**) | `/<project>/oauth/register`; deprecated by MCP, kept for existing and older clients |
| PKCE | `S256` only, required |
| Resource indicators (RFC 8707) | `resource` must name this board's MCP server (`invalid_target` otherwise); tokens only work on `/<project>/mcp` |
| Issuer in the redirect (RFC 9207) | `iss` on every consent redirect, `authorization_response_iss_parameter_supported: true` |
| Tokens | public clients only (`token_endpoint_auth_method: none`); access token 1 h, refresh token rotates on every use, 90 days idle |
| Refresh token reuse (RFC 9700 §4.14.2) | presenting an already-rotated refresh token revokes every token of that grant (`invalid_grant`, the person reconnects) and is logged in the workspace activity |

**CIMD:** the metadata document is fetched only after the person signs in, over https only, never from internal
addresses (also on self-hosted instances), without redirects, 5 s / 16 KB, cached per `Cache-Control` (5 min default,
1 day max, failures 1 min), at most 30 fetches per IP per 10 min. It must contain `client_id` (exactly its URL),
`client_name` and `redirect_uris` (https or loopback http); `token_endpoint_auth_method` must be `none` (no
`private_key_jwt` yet). The consent screen shows the verified domain of the `client_id` under the self-declared name
and logo, the host it will return to, and a warning when that is only `localhost`. Code:
`apps/web/src/lib/oauth-cimd.ts`.

Personal access tokens work in self-host and cloud, on `/<project>/mcp` (also on the board's custom domain or cloud
subdomain) and on the instance-wide `/mcp` (primary host only); OAuth-issued tokens only on `/<project>/mcp`. Both have the
same scope caps: token scope ∧ the owner's current role (members never triage).
