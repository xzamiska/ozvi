# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 App Router (React 19 server components, server actions), Tailwind CSS v4 + shadcn/ui mapped onto `--oz-*` custom properties (see DESIGN.md). Widget: Preact web component in shadow DOM (< 20 kB gzip).

## What it is

Ozvi is a feedback product for small software teams: **private bug reports** with automatic technical context and a screenshot, plus a **public idea board** with voting, a roadmap and a changelog ("Novinky"). It replaces Fider for the owner's own products (Billiwo — invoicing, Apinido — API tooling) and is sold as a cheap hosted cloud (ozvi.io) and as a free self-hosted image (FSL source-available).

## Who uses it, and for what

- **End users of the host app** (accountants, freelancers, small-business owners using Billiwo; developers using Apinido). They arrive from inside the host app (widget button or link), already signed in by SSO. Jobs: report a bug in under a minute without explaining their browser; suggest an idea or vote for an existing one; see what is planned and what shipped; get told when their thing is fixed. Infrequent visitors — the board must be obvious on first sight.
- **The host app's team** (1–5 people: founder-developer, support). Jobs: triage incoming bugs (status, private notes, link GitHub issue, merge duplicates), decide on ideas, publish changelog entries that notify voters, configure the board (theme, SSO, domain, integrations, webhooks, MCP tokens). Frequent, quick sessions between other work.
- **Ozvi cloud customers** (indie founders, small studios) on ozvi.io: sign up, create a project, invite colleagues, choose a plan, connect their app.

## Positioning and mechanism

- **Looks like the host product, not like Ozvi.** Every board adopts the host's brand through a small token contract (accent, ink, surface, canvas, border, body/heading font, radius, density, optional dark palette, logo). A board for Billiwo should feel like a page of Billiwo.
- **Closes the loop.** Bug → "fixed in v2.14.1, does it work for you?"; idea → status → roadmap → changelog → one e-mail to every voter.
- Bugs are private (reporter + team); ideas are public (optionally).
- Every feature is in self-host; cloud plans limit only what costs money (e-mails, storage, custom domain, AI).
- MCP tools for AI assistants with safe handling of untrusted user text.

## Constraints future work must preserve

- **Theme contract.** All board UI reads `--oz-*` variables from `@ozvi/theme`; no hard-coded brand colours on board surfaces. Any host palette and any Google/system font must still look intentional, in light and dark. New tokens only with schema + test.
- Ozvi's own surfaces (landing, `/app`, legal) use the `ozvi` preset.
- Slovak UI copy; verbs name the action ("Nahlásiť chybu", not "Odoslať"); errors say what happened and what to do.
- Widget < 20 kB gzip, no global styles in the host page.
- Accessibility: keyboard, visible focus, WCAG AA contrast (theme warns owners on low contrast).
- Never call it "open source"; it is "verejný zdrojový kód" (FSL).

## Voice

Plain, calm, specific, a little warm. No marketing hype on the board; the landing may persuade but makes no invented claims (no fake customers, testimonials or numbers).

## Open / inferred

- Inferred (owner delegated all design decisions on 2026-11-07): audience details above come from the repository and owner conversations, not from a separate interview.
- Final product name and domain (Ozvi / ozvi.io) are not final.
