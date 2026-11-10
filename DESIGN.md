---
name: Ozvi
description: Feedback board that wears the host product's brand; every report travels a numbered route like a parcel.
colors:
  # "ozvi" preset (packages/theme presets.ozvi): Ozvi's own surfaces. On a board these five come from the host theme.json.
  indigo: "#5A3FE6"
  night-ink: "#0D0C14"
  paper: "#FFFFFF"
  console-canvas: "#F7F7F9"
  hairline: "#E6E5EC"
  indigo-dark: "#9D8CFF"
  night-ink-dark: "#EDECF5"
  paper-dark: "#121119"
  console-canvas-dark: "#0A0A0F"
  hairline-dark: "#25232F"
  # Route stage base hues (mixed toward --oz-ink at runtime; see Colors).
  stage-ack-amber: "#C27C0E"
  stage-done-green: "#138A4B"
  danger-red: "#C8322A"
typography:
  display:
    fontFamily: "var(--oz-font-heading), Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "66px"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "var(--oz-font-heading), Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--oz-font-heading), Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  tracking-number:
    fontFamily: "var(--oz-font-heading), Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  body:
    fontFamily: "var(--oz-font-body), Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "var(--oz-font-body), Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "max(3px, calc(var(--oz-radius) * 0.5))"
  md: "max(4px, calc(var(--oz-radius) * 0.75))"
  lg: "var(--oz-radius)"
  xl: "calc(var(--oz-radius) + 4px)"
  full: "9999px"
spacing:
  frame: "1180px"
  gutter-mobile: "16px"
  gutter-desktop: "28px"
  row-x: "20px"
  row-y: "16px"
  panel-pad: "20px"
  rail-list: "300px"
  rail-detail: "340px"
  column-gap: "40px"
components:
  button-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-primary-lg:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 24px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night-ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  segment-active:
    backgroundColor: "{colors.night-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
  panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xl}"
  vote-button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night-ink}"
    typography: "{typography.tracking-number}"
    rounded: "{rounded.lg}"
    width: "48px"
    height: "56px"
---

# Design System: Ozvi

## Overview

**Creative North Star: "The Tracking Page"**

Every bug report and idea is a shipment with a number and a route. The board is a parcel-tracking overview, not a forum: you see where your thing is now and what the next stop is. The host surface is label stock, the host ink is label print, the host accent is the route line and the actions. Ozvi lends the scale, density, shape language, state vocabulary and the route; the host lends every colour, font and radius.

Two worlds share one token contract. A **board** (`/[project]/*`, widget, e-mails) reads only `--oz-*` variables injected from the host's `theme.json` by `toCss()` in `packages/theme`; it must feel like a page of the host product under any palette and any Google/system font, light and dark. **Ozvi's own surfaces** (landing, `/app`, legal) run the same tokens from the `ozvi` preset (indigo on night ink, Geist and Geist Mono) and add what a host never gets: the "Ozvena" mark, the wordmark and the landing motion.

Density is calm-operational: one ruled panel of rows, a right rail of route context, generous but not airy (15.5px body, 16-20px row padding). State is spoken in a fixed shape vocabulary, so the route reads in any host palette and without colour.

**Key Characteristics:**
- Every colour, font and radius on a board comes from `--oz-*`; nothing brand-coloured is hard-coded.
- The route ("trasa") is the signature: mini stop-rail in every row, dated vertical timeline on detail, lanes on the roadmap.
- State never by colour alone: hollow-dotted, dot-in-ring, half, filled-check, double-ring-check, slashed.
- One 1180px frame for every page; the header never moves.
- Rows live inside one ruled panel, not stacked cards.
- Numbers are tracking numbers: heading face, heavy, tabular figures.
- Slovak status vocabulary, fixed.

## Colors

A five-token host palette plus a derived layer of `color-mix(in oklab, …)` tones, three fixed-hue route stages tempered toward the host ink, and one Ozvi-only yellow.

### Primary
- **Accent** (`--oz-accent`; Ozvi preset: Indigo, see frontmatter): the route line, primary buttons, active tab underline, focus ring, caret, selection tint, the "in progress" stage. On a board this is the host's accent. Text on it is `--oz-on-accent`, computed by `onAccent()` (white or black, whichever contrasts more).
- **Accent Text** (`--oz-accent-text` = accent 82% + ink): links and accent-coloured text on surface; pulled toward ink so pale host accents stay readable. Use this, never raw `--oz-accent`, for text.
- **Accent Soft / Accent Line** (`--oz-accent-soft` = accent 11% on surface; `--oz-accent-line` = accent 35% on border): voted state, team badges, team-reply borders.

### Secondary (route stages)
Fixed by position on the route (`lib/route.ts` `toneOf`), so a status reads the same on every board:
- **Waiting** (`--oz-st-wait` = `--oz-subtle`): first stop (Navrhnuté / Prijaté).
- **Acknowledged Amber** (`--oz-st-ack` = Stage Ack Amber 88% + ink): second stop (Plánované / Potvrdené); also `--oz-warn` and internal-note tint.
- **Working** (`--oz-st-work` = accent): Rozpracované.
- **Delivered Green** (`--oz-st-done` = Stage Done Green 90% + ink): Vydané, Opravené, Overené; also `--oz-success`.
- **Off Route** (`--oz-st-off` = subtle): Zamietnuté, Nebudeme riešiť.
- **Danger** (`--oz-danger` = Danger Red 92% + ink): destructive actions and errors only.

### Ozvi brand (own surfaces only: landing, `/app`, legal)
Chosen 2026-11-08: variant A "Ozvena", reworked so Ozvi reads as a technically strong product company (earlier raspberry and yellow directions were rejected by the owner). The `ozvi` preset is indigo on night ink (accent `#5A3FE6`, dark `#9D8CFF`), Geist for everything, Geist Mono only for code, IDs, versions and measurements.
- **Mark** ("Ozvena"): the letter o as a ring plus two arcs echoing out of it (`components/ozvi/Logo.tsx`, `OzviMark`, `MARK`). The ring takes the accent, the arcs the text colour; `mono` draws all in currentColor. Favicon `public/ozvi-icon.svg` (Ozvi surfaces only; a board shows its own icon, `app/[project]/favicon`) (white mark on an indigo tile). Never a line-with-dot (Apinido) and not violet `#7C3AED` (Billiwo).
- **Wordmark**: lowercase "ozvi", Geist 600, tracking -0.05em (`--font-brand`, fonts via `BRAND_FONTS`). Never on a board.
- **Landing** is always dark (preset's dark palette as base, `app/Landing.tsx`). Hosts inside it (hero app, showcase) keep their own light themes via `.look-*` + `.oz-scope`. CTAs are ink-on-light (`bg-foreground text-background`); indigo is reserved for state and accents.
- **Console** (`/app/w/*`) is an app shell: full-height left sidebar (workspace switcher, nav, projects, account) on desktop, a top bar with a sheet on phones (`components/ozvi/ConsoleNav.tsx`).
- **Motion**: anime.js (v4) on the landing only. The hero (`components/landing/HeroStage.tsx`) tells one report twice in sync: what the user sees in the host app, and the event log of what Ozvi did (widget upload, API, outbox e-mail, webhook, GitHub link, MCP status change). Every log line is a real mechanism. Sections rise once on first view (`Reveal`). Markup is the finished state; reduced motion sees it without animation. Nothing moves on its own for more than 5 s (WCAG 2.2.2): the logo echo plays once, the hero waves finish within 5 s, the phone story plays once.

### Neutral
- **Label Stock** (`--oz-surface`): panels, header, inputs, outline buttons.
- **Depot Grey** (`--oz-canvas`): page background (`--color-background`).
- **Label Print** (`--oz-ink`): all text and the active segment fill.
- **Rule Grey** (`--oz-border` = `--oz-line`): row rules, panel borders. `--oz-line-strong` (ink 20% into border) for inputs, outline buttons, unreached route stops.
- **Field Line** (`--oz-field-line`, ink 42% into border, ~3.5:1 on presets): outlines of inputs, selects, checkboxes, radios and switches (`--color-input`), so a field's boundary is visible (WCAG 1.4.11).
- **Muted** (`--oz-muted`, ink 62% on surface): secondary text, meta, placeholders. **Subtle** (`--oz-subtle`, 45%): placeholders, waiting/off stages. **Faint** (`--oz-faint`, 5%): ghost hover, `muted` background. **Wash** (`--oz-wash`, ink 3% on canvas): row hover, callout wells.

Dark mode: the theme's optional `dark` palette is emitted under `@media (prefers-color-scheme: dark)`; all derived tokens re-derive automatically. `:root, .oz-scope` both declare the derived layer so a nested theme (landing showcase) re-derives.

### Named Rules
**The Host Owns The Colour Rule.** On any board surface every colour, font and radius is read from `--oz-*` (or the Tailwind aliases mapped onto them in `@theme inline`). A literal hex on a board is a bug. New tokens only with schema + test in `packages/theme`.

**The Brand Stays Home Rule.** The Ozvi mark, wordmark and the landing motion appear only on Ozvi's own surfaces. A host's board, widget or e-mail never shows them (the optional "Spätná väzba cez Ozvi" badge is plain text).

**The Readable Board Rule.** A host may pick any palette (the editor warns, never blocks), but a board, widget and e-mail never render text below WCAG AA. `toCss()` runs the palette through `readablePalette()` (`packages/theme/src/a11y.ts`): if ink, muted text (also on faint/wash wells), accent text, button text or a stage colour would fall under 4.5:1 (accent under 3:1), the ink is pushed away from the surface, then the accent, surfaces only as a last resort; stage colours bend toward ink first. The editor lists each adjusted colour. Derived-token formulas live in `globals.css` and `a11y.ts` together (a test pins them).

**The Shape Carries State Rule.** Stage hues are a second channel. Every status is first a shape (`StatusMark`) and a word (`STOP_LABEL`); remove the colour and the state must still read.

## Typography

**Display / Heading Font:** `--oz-font-heading` (falls back to body). Ozvi preset: Geist.
**Body Font:** `--oz-font-body`, then `ui-sans-serif, system-ui, sans-serif`. Ozvi preset: Geist.
**Mono:** `ui-monospace` for `kbd`, code samples and console output only.

**Character:** One family, weight does the work. Heavy heading face for titles and tracking numbers; plain body for reading. Fonts are whatever the host chose, so hierarchy is built from weight, size and tracking, never from a specific typeface.

### Hierarchy
- **Display** (800, 44 / 56 / 66px responsive, 1.02, -0.035em): landing hero only. Landing section heads at 800, 32-40px.
- **Headline** (700, 28px → 32px at md, tight): page title in `PageHead`, followed by the count in 18px 600 muted tabular. Detail title is 26 → 30px.
- **Title** (700, 15-17px): rail and panel headings ("Trasa", "Pre tím"), roadmap lane heads, settings section heads.
- **Row title** (600, 16.5px, snug): item titles in lists.
- **Body** (400, 15.5px, 1.55): base. Long text uses `.oz-prose` (68ch, 1.65, 16px on detail). Ledes 15px muted, max 62ch.
- **Label** (600, 13px): status tags, rail section titles (muted), team block titles, meta. Meta text 12.5-13px muted.
- **Tracking Number** (heading face 700-800, 15-20px; 26px on the landing label; tabular): `#128`. Always prefixed `#`.

Headings get `text-wrap: balance` and -0.012em; paragraphs `pretty`. `time` and `[data-num]` get tabular figures globally.

### Named Rules
**The Tracking Number Rule.** Item numbers, vote counts, counts beside titles, versions and dates are figures: heading face, bold or heavier, `data-num`/`tabular-nums`. A number never sits in body weight.

**The Fixed Vocabulary Rule.** Route stops are always: ideas Navrhnuté, Plánované, Rozpracované, Vydané (off: Zamietnuté); bugs Prijaté, Potvrdené, Rozpracované, Opravené, Overené (off: Nebudeme riešiť). Read them from `STOP_LABEL`; never "V práci" or ad-hoc synonyms. Unreached stops are phrased as future ("Ďalej: …", `NEXT_HINT`). A board admin may rename a stop per language and add sub-statuses under a stop (Settings → Stavy); the rename reaches every `route.label` lookup on that board through the i18n request config, the sub-status shows after the stop name ("Rozpracované · V testovaní"). Shapes, tones, order and the stage logic never change.

**The Tag Rule.** Tags are small chips: a dot in a token colour (`TAG_CHIP` in `lib/tag-rules.ts`: neutral, accent, amber, green, red, muted), the name, and for team-only tags a dashed border and a lock. Never a hex colour, never a filled pill that competes with the status.

## Layout

- **Frame:** `.oz-frame`, max-width `--oz-frame` (1180px), gutter 16px → 28px at 768px. Header, page and footer all use it, so switching tabs never shifts the brand or nav. Narrow forms use `Page measure=…`, which narrows content but keeps it on the frame's left edge.
- **Page anatomy:** `Page` (32px → 40px top, 64px bottom) → `PageHead` (title + count + lede left, actions right, aligned to the baseline) → body.
- **List pages:** `grid lg:grid-cols-[minmax(0,1fr)_300px]`, 40px gap. Main: one toolbar line (search flexes, then `Segments` filters), then the panel. Right rail sticky at `top-24`: "Naposledy vydané" and the `RouteLegend`.
- **Detail:** `minmax(0,1fr)_340px`. Content and comments left; rail with the Trasa timeline and the dashed "Pre tím" block. Below `lg` the timeline moves above the body.
- **Roadmap:** three lanes (Plánované, Rozpracované, Vydané) on a shared horizontal route line, lane heads centred on their stop mark.
- **Header:** sticky, full-width, `bg-surface/95` with blur; 56px → 64px tall; brand left, underline tabs centre, account right. On phones tabs drop to a second, sideways-scrolling row.
- **Rhythm:** 4px base (Tailwind); rows 16px/20px padding; panels 20px; rail sections 24-32px apart.

## Elevation & Depth

Flat, ruled and tonal. Depth comes from surface vs canvas, 1px rules and dashed borders, not shadows. Outline buttons and inputs carry shadcn's `shadow-xs` hairline only.

### Shadow Vocabulary
- **Pop** (`--oz-shadow-pop`: `0 1px 2px ink 8%, 0 12px 32px -12px ink 28%`): popovers, menus, dialogs.
- **Label lift** (`0 1px 0 var(--oz-ink), 0 24px 48px -24px ink 45%`): the landing tracking label only.

### Named Rules
**The Ruled Panel Rule.** Lists are one bordered surface with `divide-y` rules between rows; hover is a `--oz-wash` fill, never a lift.

**The Dashed Means Not-Yet Rule.** Dashed borders mark the unreached or the internal: the next stop on the timeline, empty states, the team-only block, internal notes. Solid means public and reached.

## Shapes

Every corner derives from the host's `--oz-radius` (0-24px; Ozvi preset 8px): sm = half (min 3px), md = three-quarters (min 4px), lg = radius, xl = radius + 4px. Panels and cards use xl, vote buttons lg, buttons/inputs/segments md, small badges sm. Route stops, rails and avatars are full circles; route connectors are 2px (rows) or 3px (landing) bars. Ozvi's own heavy moments (landing label, tariff table) use a 2px ink border.

## Components

### Buttons
Shadcn new-york, re-pointed at the host tokens.
- **Shape:** md radius; 36px default, 32px sm, 40px lg (48px on landing hero).
- **Primary:** `--oz-accent` fill, `--oz-on-accent` text, 500 weight, 14px; hover at 90%.
- **Outline:** `--oz-surface` fill with `--oz-line-strong` border (adapted from shadcn so it sits on canvas); hover `--oz-faint`.
- **Ghost / Link / Destructive:** ghost for header icons; destructive uses `--oz-danger`.
- **Focus:** 3px ring of accent at 50%; global `:focus-visible` is a 2px accent outline, 2px offset. Never remove an outline without a ring in its place; whole-row links draw the outline on their `::after`.
- Labels name the action ("Navrhnúť nápad", "Nahlásiť chybu"), never "Odoslať".

### Segments (filters)
Link-based segmented control: 36px bordered surface track, 2px inset; items 13.5px 500 muted; active item filled with ink, text in surface. Filters live in the URL.

### Inputs / Fields
Surface fill, `--oz-field-line` border, md radius, 36px; placeholder `--oz-muted` (placeholders are text, 4.5:1); focus border + 3px accent ring at 50%; invalid uses danger.

### Navigation
Board tabs (Nápady, Roadmapa, Novinky, Hlásenia chýb / "Chyby" on phones): 14.5px 500 muted, hover ink; active is ink with a 2px accent underline flush to the header rule. Back links: "← Section" 14px 500 muted.

### Item Row (signature list unit)
Inside the ruled panel: vote button (ideas) or right-aligned `#number` (bugs) | title 16.5px 600 with muted `#number`, one-line excerpt, meta line | right column (md+, min 150px) with `StatusTag` over `RouteRail`. Whole row is a stretched link (`.oz-stretch`); hover = wash + muted underline.

### Vote Button
48×56px (68×64 large) surface tile, lg radius, `--oz-line-strong` border, chevron over count in heading face tabular. Voted: accent-soft fill, accent-line border, accent-text. Press scales to 95%.

### Route (signature)
- **StatusMark** (16px SVG, stroke 1.5): first stop hollow dashed ring; ack ring with centre dot; in progress half-filled; reached filled disc with surface check; final bug stop (Overené) double ring with check; off-route ring with slash.
- **RouteRail:** stops as 8px dots joined by 2px × 12-16px bars; reached in the stage tone, current 10px with a 3px ring at 25%; unreached hollow `--oz-line-strong`; off-route at 60% opacity. Carries `role="img"` and "Stop, zastávka n z m".
- **RouteLegend:** vertical list of every stop with mark, name and `STOP_HINT`, joined by a 1px line; current marked "teraz".
- **Journey:** detail timeline in a surface panel: dated events (status, team reply, GitHub, release) on a solid 1px line, ending in a dashed segment to "Ďalej: <stop>" with `NEXT_HINT`.
- **Roadmap lanes:** three lanes on one route line, each headed by its StatusMark, small bordered cards below.

### Cards / Containers
`Panel`: surface, 1px rule, xl radius, overflow hidden. `EmptyState`: dashed border, surface at 60%, centred heading + 46ch text. `RailSection`: 13px 600 muted heading over content. Team-only block: dashed border. Comments: bordered bubbles; team replies accent-line border with a "tím" badge; internal notes dashed with ack tint and "len pre tím".

### Widget (`packages/widget`)
Preact web component in shadow DOM with its own hand-written CSS (no Tailwind), reading the same `--oz-*` variables via `toCss(theme, ":host")`. Pill launcher in accent, panel at radius + 4px, inputs and buttons at `--oz-radius`. Fonts are linked into the host document once (`@font-face` does not work in shadow DOM); no global styles leak into the host page.

## Do's and Don'ts

### Do:
- **Do** read every board colour, font and radius from `--oz-*` or its mapped alias (`bg-surface`, `text-brand-text`, `border-line-strong`, `rounded-xl`).
- **Do** show state as `StatusMark` shape + `STOP_LABEL` word; colour is the second channel.
- **Do** put the route on every report: `RouteRail` in rows, `Journey` on detail, lanes on the roadmap.
- **Do** wrap every page in `Page` / `.oz-frame` (1180px) so the header never moves.
- **Do** render lists as rows inside one `Panel` with `divide-y`.
- **Do** set numbers, counts, versions and dates as tracking numbers: heading face, bold, `data-num`.
- **Do** use `--oz-accent-text` for accent-coloured text, `--oz-accent` for fills and lines.
- **Do** phrase unreached stops as what will happen ("Ďalej: Opravené").

### Don't:
- **Don't** hard-code brand colours, fonts or radii on a board, widget or e-mail.
- **Don't** use the Ozvi mark, wordmark or landing motion anywhere a host's brand is shown.
- **Don't** convey a status by colour alone or invent a new status mark.
- **Don't** use "V práci" or any synonym for the fixed stop labels.
- **Don't** stack lists as separate floating cards, or narrow a page into its own centred column off the frame.
- **Don't** add shadows to rows or panels at rest; lift is reserved for popovers and the landing label.
