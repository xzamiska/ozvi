# Test scenarios (regression)

What Ozvi does from the point of view of the people who use it, and which test guards it. Two layers:

- **Unit and integration tests** (`pnpm test`, vitest): logic, database, RLS, import, SDK, the widget without a browser.
- **Browser tests** (`apps/e2e`, Playwright): whole flows as a person clicks through them, in **both Chromium and WebKit** (the Safari engine), selected ones also on iPhone (`@mobile`). They run against a separate instance (`scripts/e2e-server.sh`: its own `ozvi_e2e` database, a production build, e-mails in Mailpit).

```sh
docker compose up -d                       # Postgres + Mailpit
pnpm --filter @ozvi/e2e e2e                 # starts the instance and the tests
pnpm --filter @ozvi/e2e e2e -- --project=webkit tests/board.spec.ts
```

Status: ✅ automated · 🧪 unit/integration test only · ⬜ manual for now.

## 1. Console: sign-in and projects (`console-auth.spec.ts`)

| Scenario | Status |
|---|---|
| New address: code from the e-mail → account → first project → board | ✅ |
| The link from the e-mail signs in only after a click (a scanner doesn't use it up) and works once | ✅ |
| A wrong code is rejected with a message | ✅ |
| A reserved project address (`admin`, …) is rejected | ✅ |
| 5 attempts per code, attempt limit per IP | 🧪 |

## 2. Team and invitations (`team-invites.spec.ts`)

| Scenario | Status |
|---|---|
| Member invitation: e-mail → confirmation → member, member permissions (no inviting or plan, with board settings), link works once | ✅ |
| Owner invitation: the e-mail mentions the plan and inviting, the new owner can invite and change the plan | ✅ |
| Someone already in the team can't be invited; role change; removal (loses both the console and the board); cancelling an invitation invalidates the link | ✅ |
| The last owner can't leave | ✅ |
| A new invitation replaces the old one, max. open invitations | 🧪 |

## 3. Board for users (`board.spec.ts`)

Ideas (creating, approval, simple and importance-weighted voting, comments, search), status changes and e-mails to voters, roadmap, changelog and RSS, private bug reports (outsiders can't see them, not even via the direct address), moderation, merging duplicates, one-click unsubscribe from e-mails, “My data” (export, deletion), e-mail sign-in on the board, board language, `noindex`, old Fider links.

## 4. Sign-in from the app and the widget (`sso-widget.spec.ts`)

SSO token (return, expiry, forgery, open redirect protection, roles from the token, sign-out when a role is lost, interstitial page when switching accounts, language from the token, coming from the console as an admin, an owner signed in from the console stays an admin even after opening the board from the app with the same verified address). The widget on a third-party page: the form opens instantly with the screenshot taken in the background, masking, sending with context (console, network, masked secrets), ideas and voting in the widget, `launcher="none"`, `position="bottom-left"`, `::part()`, events, iPhone, rejecting a disallowed origin (both the report and the ideas list explain it).

## 5. Board settings and integrations (`admin.spec.ts`)

Every admin section saves and shows up on the board (appearance including “The logo already includes the name”, project, sections, voting, languages, tags, statuses), SSO (the status shows right after enabling it, rotating the secret invalidates the old token), custom domain, people, webhooks (SSRF protection), API tokens and the REST API, MCP without a token, CSV import with undo, export, data retention, deleting a project.

## 6. Console, plans and the public website (`console-billing-site.spec.ts`)

Plan limits (Free 1 project, one free workspace per person, even with Gmail aliases), simulated Pro/Studio payment and the change in limits, renaming and deleting a workspace, changing the account e-mail, signing out everywhere, deleting the account, activity and delivery. The public website in all languages without console errors, a Czech browser on `/` gets `/cs` (navigating around the site doesn't redirect), the “Sentry sees the code” block with the comparison and the FAQ, links, documentation, legal pages, sitemap/robots, `noindex` on boards and in the console, 404, mobile without horizontal scrolling.

## Manual / outside automation

- Real Safari with sign-in into the host app (verified manually via AppleScript on billiwo.com, 15 Nov 2026).
- Real Safari: creating an idea, reloading the detail and going to the list (verified manually on staging, 16 Nov 2026; automated WebKit occasionally shows “Page crashed”, which doesn't happen in Safari).
- Payments through real Creem (Creem test mode only, on staging).
- OIDC with an external provider, GitHub App, Linear, Jira (they need external accounts).
- E-mails in clients (Gmail, Outlook) – appearance.
