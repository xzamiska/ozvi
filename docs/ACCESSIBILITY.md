# Accessibility conformance report

**Product:** Ozvi (web app: hosted boards, bug-report widget, `/app` console, landing and legal pages), one codebase for cloud and self-host
**Report date:** 2026-11-08 · **Version tested:** `main` after wave 1 (local dev build)
**Standards:** WCAG 2.2 level A and AA; EN 301 549 v4.1.1 (2024-11) clause 9 (web), with notes on clauses 10 (non-web documents: e-mails) and 12 (documentation and support). Legal context: European Accessibility Act, Slovak Act No. 351/2022 Coll., Czech Act No. 424/2023 Coll.
**Format:** VPAT 2.5 style (EU edition). Levels: **Supports**, **Partially supports**, **Does not support**, **Not applicable**.
**Public statement:** `/accessibility` (sk, cs, en), linked from the landing footer, the console footer, the legal pages and every board footer.

## Summary

Ozvi **partially conforms** to WCAG 2.2 AA. No automated violations remain on any audited screen, and keyboard, focus, reflow, motion and contrast were checked by hand. It is "partially" rather than "fully" because of the items in [Known limitations](#known-limitations), chiefly: no test yet with real screen reader users, user-generated content we cannot fix (images without alt text, wide code blocks), and form-field outlines on custom host palettes that are not guaranteed 3:1.

## Scope

| In scope | Notes |
|---|---|
| Board: ideas, roadmap, changelog (+ new/edit entry), bugs, unanswered, item detail, new idea / bug, sign-in, my data, API tokens, settings (incl. theme editor, import), MCP OAuth consent, unsubscribe, not-found and gate pages | Self-mode board `billiwo` as anonymous, member and team/admin; cloud board `fakturnik` |
| Widget `<ozvi-widget>` (shadow DOM) | `/demo` host page: launcher, menu, bug form, sent view |
| Console `/app` | Login, workspace overview, account |
| Ozvi own pages | Landing `/`, `/cs`, `/en`, `/terms`, `/privacy`, `/accessibility` |
| Out of scope | MCP server and REST API (no UI), CLI, third-party pages (Creem checkout, GitHub), the host application around the widget |

## Test method

- **Automated:** axe-core 4.10.3 injected with Playwright (Chrome 141) on every in-scope screen, tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`, at 1440×900, 390×844 and 320×640, light and dark colour scheme (`prefers-color-scheme`), with the widget opened to its menu and bug form. The audit script lives outside the repo (playwright-core and axe-core are not app dependencies); re-run it before each release.
- **Manual (keyboard and behaviour):** Tab-through of ideas, item, new item, admin and landing checking that every stop has a visible indicator and a ≥24 px target (or spacing); skip link; voting (simple and importance picker) with Enter/Space and Escape; comment with Ctrl/⌘+Enter; moderation menu and confirm dialogs; widget open → Tab cycle → Shift+Tab → Escape → focus back on the launcher; bug report from the widget by keyboard; theme editor fields.
- **Reflow and spacing:** 320 px width (= 1280 px at 400 %) on every screen; WCAG 1.4.12 text-spacing override injected on ideas, item, admin, roadmap and landing (no clipped text).
- **Motion:** `prefers-reduced-motion: reduce` on the landing (Reveal, story, hero echo) and widget; auto-playing motion timed.
- **Contrast:** axe plus a unit-tested model of every derived text token (`packages/theme/src/a11y.test.ts`).
- **Not done yet:** sessions with screen reader users; spot checks with VoiceOver/NVDA beyond accessible-name inspection; Windows High Contrast / forced colours; speech input.

### Automated results (axe-core, rules violated / affected nodes)

| Screen | Before | After |
|---|---|---|
| Landing `/`, `/en` (desktop) | 2 / 15 (contrast in hero log and story, tablist with a non-tab child) | 0 / 0 |
| Landing (mobile) | 3 / 14 (+ unfocusable scrolling code block) | 0 / 0 |
| Console account (dark) | 1 / 1 (danger text 4.26:1) | 0 / 0 |
| Board sign-in / not-found | 1 / 1 (no h1) | 0 / 0 |
| Board ideas, bugs | 1 / 1 (heading order) | 0 / 0 |
| Board new idea / new bug | 1 / 1 (muted text on wash 4.46:1) | 0 / 0 |
| Board settings, API tokens (mobile) | 1 / 2 (unfocusable scrolling code) | 0 / 0 |
| Board settings (import tabs, found after fixes) | 1 / 2 (tab text 4.4:1) | 0 / 0 |
| Widget demo host | 4 / 10 (landmarks of the fake host page) | 0 / 0 |
| Roadmap, changelog, item, me, consent, console overview/login, legal, `/accessibility` | 0 / 0 | 0 / 0 |

After: **0 violations on all 28 screens, 48 screen × colour-scheme combinations, 144 runs across the three widths** (final run plus a re-run of the screens fixed last). Automated tools find roughly a third of WCAG issues; the manual checks above cover the rest that we could test.

## What was fixed in this pass

- **Readable boards whatever the host palette** (`packages/theme/src/a11y.ts`): `toCss()` now renders a palette where ink, muted text (also on faint/wash wells), accent text, button text and the stage colours (Prijaté/Opravené/danger) reach 4.5:1 and the accent 3:1. Failing colours are nudged minimally (ink first, then accent, surfaces last); presets are untouched. Used by boards, widget (`:host`), console, legal pages, the landing playground and e-mails. The theme editor lists each colour it will adjust. Unit tests cover presets, pale light and murky dark palettes, impossible greys, and pin the formulas to `globals.css`.
- Skip link ("Preskočiť na obsah") on every page, every `<main>` is `#main`; `scroll-padding-top` so focus is never under the sticky header.
- Page titles: every board page is "<page> – <project>" (item pages "#N – <project>"), console pages "<section> – Ozvi – konzola".
- Heading structure: row titles are h2 under the page h1; not-found/gate pages have an h1.
- Focus: whole-row links draw a visible outline; voting keeps focus on the button while saving (was dropped to `<body>`); widget moves focus into the panel, traps Tab inside, closes on Escape and returns focus to the launcher; sent view focuses its heading; screenshot preparation is announced.
- Contrast: hero log, story steps (no more 35 % opacity), pricing "no" icon, code comments, tab triggers, danger in dark mode, placeholders (now muted), form-field outlines (`--oz-field-line`, ~3.5:1 on presets).
- Scrollable code blocks are keyboard focusable; landing playground tabs follow the tabs pattern (arrow keys, tabpanel), its rows open from a real button.
- Motion: logo echo plays once; the hero wave repeats every 7 s and has a visible pause button (remembered per browser, hidden and not animated under reduced motion) (WCAG 2.2.2).
- Reflow at 320 px: legal header wraps; Markdown editor toolbar wraps.
- Target size: language switcher and back links are ≥24 px tall; widget attachment remove buttons 24 px.
- Widget option buttons have spaced accessible names; error text uses the theme's danger colour.

## WCAG 2.2 criteria

### Principle 1 – Perceivable

| Criterion | Level | Conformance | Remarks |
|---|---|---|---|
| 1.1.1 Non-text Content | A | Partially supports | UI icons are named or `aria-hidden`; decorative logos `alt=""` beside the visible name; status marks have text. Attachment images uploaded by people are shown with the file name as alt text only; the widget screenshot is described as "Screenshot to be attached" but its content is not. |
| 1.2.1–1.2.5 Time-based media | A/AA | Not applicable | No audio or video. |
| 1.3.1 Info and Relationships | A | Supports | Landmarks (header, nav, main, footer), heading hierarchy, lists, labelled fields, fieldsets with legends, table headers on the pricing table, status = shape + word. |
| 1.3.2 Meaningful Sequence | A | Supports | DOM order matches reading order; the detail timeline moves above the body on small screens in markup order. |
| 1.3.3 Sensory Characteristics | A | Supports | Instructions never rely on shape, colour or position alone. |
| 1.3.4 Orientation | AA | Supports | No orientation lock. |
| 1.3.5 Identify Input Purpose | AA | Supports | `autocomplete="email"`, `one-time-code`, name fields; no other personal-data fields. |
| 1.4.1 Use of Color | A | Supports | Status by shape and word; links in prose underlined; errors are text. |
| 1.4.2 Audio Control | A | Not applicable | No audio. |
| 1.4.3 Contrast (Minimum) | AA | Supports | Enforced for every host palette (see above); axe clean in light and dark. Disabled controls are exempt. |
| 1.4.4 Resize Text | AA | Supports | Rem/px text scales to 200 % without loss. |
| 1.4.5 Images of Text | AA | Supports | Only logos (exempt). |
| 1.4.10 Reflow | AA | Supports | No horizontal scrolling at 320 px; code blocks and the landing pricing table scroll inside their own box (two-dimensional content). |
| 1.4.11 Non-text Contrast | AA | Partially supports | Focus ring and accent are enforced at 3:1. Form-field outlines reach 3.2–3.9:1 on all presets but are a fixed mix and are not enforced for custom host palettes; secondary outline buttons and route connectors are below 3:1 but are not needed to identify the control (label text) or the state (word + shape). |
| 1.4.12 Text Spacing | AA | Supports | Override tested; no clipped text (single-line excerpts truncate by design, full text on detail). |
| 1.4.13 Content on Hover or Focus | AA | Supports | Radix tooltips/popovers are hoverable, persistent and close with Escape; `title` hints are browser tooltips. |

### Principle 2 – Operable

| Criterion | Level | Conformance | Remarks |
|---|---|---|---|
| 2.1.1 Keyboard | A | Supports | All functions incl. voting with the importance picker, comments, moderation, theme editor, file attach (button + paste, drag-and-drop optional), widget. |
| 2.1.2 No Keyboard Trap | A | Supports | The widget panel keeps Tab inside while open (modal) and closes with Escape or its Close button; dialogs likewise. |
| 2.1.4 Character Key Shortcuts | A | Supports | Shortcuts need Ctrl/⌘ (editor) or Alt (notifications). |
| 2.2.1 Timing Adjustable | A | Supports | Only the e-mail sign-in code expires (security, essential); a new code can be sent and nothing typed is lost. |
| 2.2.2 Pause, Stop, Hide | A | Supports | The repeating hero wave has a pause button; other motion ends within 5 s; reduced motion disables it. |
| 2.3.1 Three Flashes or Below | A | Supports | No flashing. |
| 2.4.1 Bypass Blocks | A | Supports | Skip link + landmarks. |
| 2.4.2 Page Titled | A | Supports | Descriptive titles; item pages use the number only (a title could reveal a private bug report). |
| 2.4.3 Focus Order | A | Supports | Logical order; focus managed on widget open/close, popovers and dialogs (Radix). |
| 2.4.4 Link Purpose (In Context) | A | Supports | |
| 2.4.5 Multiple Ways | AA | Supports | Navigation tabs, search, filters, roadmap, changelog. |
| 2.4.6 Headings and Labels | AA | Supports | |
| 2.4.7 Focus Visible | AA | Supports | Global 2 px accent outline; components use a 3 px ring; checked by Tab-through. |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Supports | `scroll-padding-top` clears the sticky header; popovers do not cover the focused control. |
| 2.5.1 Pointer Gestures | A | Supports | No path or multipoint gestures. |
| 2.5.2 Pointer Cancellation | A | Supports | Actions fire on click (up event). |
| 2.5.3 Label in Name | A | Supports | Accessible names start with or contain the visible text (e.g. vote "19" → "Vote, 19 votes"). |
| 2.5.4 Motion Actuation | A | Not applicable | |
| 2.5.7 Dragging Movements | AA | Supports | File drop has a button; the radius slider is keyboard/click operable. |
| 2.5.8 Target Size (Minimum) | AA | Supports | Controls are ≥24 px; checkboxes (16 px), switches (32×18) and small tag chips meet the spacing exception. |

### Principle 3 – Understandable

| Criterion | Level | Conformance | Remarks |
|---|---|---|---|
| 3.1.1 Language of Page | A | Supports | `<html lang>` from the board's language, the landing path or the visitor's choice. |
| 3.1.2 Language of Parts | AA | Supports | Language switcher items carry their own `lang`; Slovak legal texts are marked `lang="sk"` in other locales. Text written by people is not marked (unknown language). |
| 3.2.1 On Focus | A | Supports | |
| 3.2.2 On Input | A | Supports | Filter selects update the list in place (URL changes, focus stays); language switch is an explicit button press. |
| 3.2.3 Consistent Navigation | AA | Supports | Same header and footer on every board page. |
| 3.2.4 Consistent Identification | AA | Supports | Fixed status vocabulary and icons. |
| 3.2.6 Consistent Help | A | Supports | Accessibility statement and contact link in the same footer position everywhere. |
| 3.3.1 Error Identification | A | Supports | Errors are text in `role="alert"`; invalid fields get `aria-invalid`. |
| 3.3.2 Labels or Instructions | A | Supports | Visible labels; optional fields marked. Exception: the landing's illustrative mini board (see limitations). |
| 3.3.3 Error Suggestion | AA | Supports | Messages say what happened and what to do. |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Supports | Deletions and merges are confirmed; payments run in Creem with its own review step. |
| 3.3.7 Redundant Entry | A | Supports | |
| 3.3.8 Accessible Authentication (Minimum) | AA | Supports | Sign-in by e-mail link or a code that can be pasted/autofilled (`one-time-code`); no passwords or puzzles. |

### Principle 4 – Robust

| Criterion | Level | Conformance | Remarks |
|---|---|---|---|
| 4.1.1 Parsing | A | Not applicable | Obsolete in WCAG 2.2 (always satisfied); EN 301 549 v4.1.1 still lists it: React output is well formed. |
| 4.1.2 Name, Role, Value | A | Supports | Native elements and Radix primitives; toggles expose `aria-pressed`/`aria-checked`; tabs and the widget dialog follow ARIA patterns. |
| 4.1.3 Status Messages | AA | Supports | Toasts in a polite live region (Sonner), form results `role="status"`, errors `role="alert"`, similar-ideas list `aria-live`, widget screenshot progress announced. |

## EN 301 549 beyond clause 9

| Clause | Conformance | Remarks |
|---|---|---|
| 5.2 Activation of accessibility features | Not applicable | No separate accessibility mode; everything is on by default. |
| 5.7 / 5.8 / 5.9 (biometrics, key repeat, simultaneous actions) | Not applicable | |
| 10 Non-web documents (notification e-mails) | Partially supports | HTML e-mails declare `lang`, use the readable palette and text links; plain-text alternative is sent. Not audited with screen readers. |
| 11 Software | Not applicable | Web content only; evaluated under clause 9. |
| 12.1.1 Accessibility and compatibility features (documentation) | Supports | This report and `/accessibility`. |
| 12.2.2 / 12.2.3 / 12.2.4 Support services | Supports | Contact address on `/accessibility`; replies within 5 working days, alternative formats on request. |

## Known limitations

1. **No screen reader user testing yet.** Names, roles and live regions were verified in code and with axe; a VoiceOver (macOS/iOS) and NVDA (Windows) pass with real users is the next step.
2. **User-generated content:** attached images have no alternative text beyond the file name; wide code blocks in Markdown posts scroll horizontally and are not keyboard-focusable (we do not alter user HTML). Planned: optional image description on upload.
3. **Widget screenshot** is an image of the host page; its content is not available to assistive technologies (the report's text fields are).
4. **Field outlines on custom palettes** (1.4.11) are a fixed ink/border mix: ~3.2–3.9:1 on presets, not enforced for every host palette. Planned: include `--oz-field-line` in the readability guarantee.
5. **Landing mini board** (illustrative "try it" board) labels two fields by placeholder only.
6. **Item page titles** show the number, not the item title (privacy of bug reports).
7. Not yet evaluated: forced colours / Windows High Contrast, speech input, and the host application around the widget (the host's responsibility).

## Contact

Accessibility feedback: the address on `/accessibility` (cloud: the operator e-mail in `apps/web/src/lib/legal.ts`; self-host: the organisation running the installation). Reply within 5 working days.

## Maintaining this report

Re-run the axe audit and the manual checklist above before each release that changes UI; update the date here and `AUDITED` in `apps/web/src/app/accessibility/page.tsx` together. New UI must keep: one `<main id="main">`, an h1, visible focus, ≥24 px targets, text tokens from `--oz-*` (never opacity on text), and motion ≤5 s.
