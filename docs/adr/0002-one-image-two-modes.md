# 0002 — One image, two modes

**Status:** accepted 2026-11-05

**Decision.** The same Docker image for both self-host and cloud. `OZVI_MODE=cloud` turns on billing (Creem), ozvi.io subdomains, Ozvi accounts (e-mail code + magic link) and workspace management. Self-host = one workspace, sign-in through the host app.

**Consequences.** The cloud cannot have "secret" features; what we test in the cloud, we also test for self-host. Cloud-specific code is kept behind a single switch, not scattered around.
