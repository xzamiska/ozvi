# 0009 — Releases on ghcr.io and an optional updater

**Status:** accepted 2026-11-09

**Context.** Self-hosted servers (Billiwo, Apinido, later customers) needed a way to get a new version without us sending them the image by hand (`docker save | ssh`). The owner asked whether the operator should update by hand, or whether Ozvi should do it automatically or on request.

**Decision.**
- **A release** is triggered by the tag `vX.Y.Z` with mandatory notes in `apps/web/releases/X.Y.Z.md`. GitHub Actions build images for `amd64` and `arm64` and push them to `ghcr.io` with the tags `X.Y.Z`, `X.Y`, `X` and `latest`. The steps are in [RELEASING](../RELEASING.md).
- **The registry is public**, like the repository (owner's decision 2026-11-09, see ADR 0008). Operators therefore need no tokens. The updater can also use a private mirror (`OZVI_REGISTRY_*`).
- **The release list** is served by ozvi.io at `/releases` and `/releases.json`, from the notes packaged in the image. This way updaters do not have to ask GitHub.
- **The updater is an optional container** (`apps/updater`, profile `updater`):
  - Modes: notify only, on request (default), automatically in a night-time window.
  - It drives `docker compose` in the operator's folder, so compose stays the single source of truth.
  - Before every update it backs up the database.
  - If the new version is unhealthy, it restores the database and starts the previous image.
  - It never automatically installs a new major version or a release marked as breaking.

**Why not Watchtower.** Watchtower cannot make backups, does not know about breaking changes and cannot restore the database when a migration fails.

**Consequences.**
- The updater needs the Docker socket, i.e. control over the server. That is why it is optional, has no public port and its API is protected by a shared token.
- Migrations only go forward, so going back without restoring a backup is not possible. A backup is therefore a precondition of every update.
- Self-host has all features with the updater too. The updater is not a paid feature.
