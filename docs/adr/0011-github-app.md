# 0011 — GitHub through a GitHub App

**Status:** accepted 2026-11-11

**Context.** GitHub was connected with a fine-grained token and a webhook that the admin added in the repository by hand: repository owner, permissions, URL, secret. The owner called this needlessly hard and asked whether it could be solved without entering the repository and token by hand.

**Decision.**
- An Ozvi instance has **one GitHub App** (`OZVI_GITHUB_APP_*`). The admin clicks Connect GitHub, installs the app on GitHub on the repositories they choose, and picks one from the list in Ozvi. No token or webhook is needed. Ozvi issues the installation tokens itself (`lib/github-app.ts`) and keeps them only in memory.
- **Verifying the installation.** The callback from GitHub arrives at the main address, not at the board's address. Therefore:
  - the board signs `state` (project, admin, 30 minutes);
  - the callback uses OAuth during installation to verify that whoever installed it can really see the installation;
  - only then does it hand the board a 5-minute ticket, and the board stores it under the admin's session.
  - Without this verification anyone could connect someone else's installation and create issues in someone else's repositories.
- **One app webhook for all boards.**
  - The installation number is on the `projects` row (`github_installation_id`). `projects` has no RLS (ADR-0004), so finding the boards does not need `withSystem`.
  - Each board processes the event in its own `withProject`, only for its own repository.
  - Uninstalling or suspending the app on GitHub disconnects the boards.
- **The token stays as a fallback.** Without a configured app (a self-host that has not created its own app), the original connection with a token and webhook per project works. Self-host has all features: `scripts/create-github-app.mjs` creates your own app through a manifest on GitHub with a single confirmation.

**Consequences.**
- Cloud and staging each need their own app (the webhook and callback point to their address).
- App permissions: Issues write; Pull requests, Contents and Metadata read. Events: issues, pull_request, release.
- Linear and Jira stay with tokens.
