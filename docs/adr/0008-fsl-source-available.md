# 0008 — FSL licence (source-available) instead of AGPL

**Status:** accepted 2026-11-07, replaces the licence part of [0001](0001-agpl-all-features-free.md)

**Context.** Under AGPL anyone can run a competing hosted Ozvi from our code; they only have to publish their changes. The owner considered not publishing the repo at all. But that would lose us the main arguments against Canny and Featurebase: public code, self-host with all features and no dependence on a single vendor.

**Decision.** The server (`apps/web`, `packages/db`, `packages/theme`, `packages/mcp`) is under the **Functional Source License 1.1 with Apache 2.0 as the future licence** (FSL-1.1-ALv2, like Sentry). The code is public. It may be used, modified and self-hosted for your own purposes and for clients. It must not be offered as a competing commercial service. Every released version automatically becomes Apache 2.0 after two years. `packages/sdk` and `packages/widget` stay MIT. The rest of 0001 still applies: self-host has all features and the cloud sells convenience, not features.

**Consequences.**
- Ozvi is not described as "open source" (FSL is not an OSI licence). We write "public source code" or "source-available".
- Contributions come in under the same licence. The future Apache 2.0 licence is granted irrevocably, so no CLA is needed.
- The owner will publish the repo (`xzamiska/ozvi` is private for now).
