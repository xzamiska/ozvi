# @ozvi/widget

Ozvi inside your app, MIT:

- `<ozvi-widget>`: the floating feedback widget (bug reports with masked context, ideas with voting), Preact in shadow DOM;
- `window.Ozvi`: a JavaScript API to open it from your own buttons, prefill it, identify the person and listen to events;
- `<ozvi-roadmap>` and `<ozvi-changelog>`: inline embeds (with a "What's new" badge);
- `@ozvi/widget`, `@ozvi/widget/react`, `@ozvi/widget/vue`: typed ESM wrappers (`npm i @ozvi/widget`).

Docs: [ozvi.io/docs/widget](https://ozvi.io/docs/widget). Signing people in from your backend: [`@ozvi/sdk`](https://www.npmjs.com/package/@ozvi/sdk).

```html
<script src="https://feedback.example.com/widget.js" defer></script>
<ozvi-widget project="billiwo" token-url="/api/ozvi-token" app-version="2.14.0"></ozvi-widget>
```

- Entry points: "Report a bug" (private, auto-context + masked screenshot), "Suggest an idea" (top ideas, search, voting
  and a new idea with similar ideas shown while typing, all inside the widget) and "My reports" (the board in a new tab).
- Styled only through `--oz-*` variables from `@ozvi/theme` `toCss(theme, ":host")`; fonts only from the Ozvi host
  (`/fonts/css`), never from Google.
- **Size**: `widget.js` stays within **20 kB gzip** (a test fails above it: `src/size.test.ts`; today 18.4 kB). Everything
  else loads on demand and reuses the widget's Preact: `widget-shot.js` (screenshot, 9.6 kB), `widget-annotate.js`
  (mark-up, 3.9 kB), `widget-ideas.js` (ideas, 4.9 kB), `widget-embeds.js` (roadmap/changelog, 4.9 kB).

## JavaScript API

Everything the attributes do, plus control from your code. `window.Ozvi` exists once `widget.js` has run. To call it
earlier (from inline code, or before the `defer` script), paste the stub first; it queues calls and `widget.js` runs
them in order:

```html
<script>(function(w,m){var o=w.Ozvi=w.Ozvi||function(){(o.q=o.q||[]).push(arguments)};o.q=o.q||[];m.forEach(function(k){o[k]=o[k]||function(){o.q.push([k].concat([].slice.call(arguments)))}})})(window,["init","open","close","toggle","prefill","identify","logout","setTraits","setLanguage","on","off","configure"])</script>
<script src="https://feedback.example.com/widget.js" defer></script>
```

| Call | What it does |
|---|---|
| `Ozvi.open(tab?)` | `"menu"` (default), `"bug"` (screenshot + form), `"ideas"` (list with search and voting), `"idea"` (new idea form), `"mine"` (the person's reports on the board, new tab) |
| `Ozvi.close()`, `Ozvi.toggle(tab?)`, `Ozvi.isOpen()` | |
| `Ozvi.prefill({ title, body, kind })` | text for the next bug report (`kind: "bug"`, default) or idea (`"idea"`); `null` clears. Cleared after a successful send |
| `Ozvi.identify(token \| () => token \| { token, id })` | use this SSO token (or a function returning a fresh one) instead of `token-url`; `id` only keys the local "seen" state of the changelog |
| `Ozvi.logout()` | forget the identity and any cached token (call it when the person signs out of your app) |
| `Ozvi.setTraits({ plan: "Pro" })` | shown to the team with bug reports as "Page data (unverified)". Traits that matter (MRR, plan for sorting) belong in the **signed** token (`traits` in `signOzviToken`) |
| `Ozvi.setLanguage("en")` | `sk`, `cs`, `en`; switches the widget and the embeds at once |
| `Ozvi.on(event, fn)` → `unsubscribe`, `Ozvi.off(event, fn)` | see events below |
| `Ozvi.init({ project, tokenUrl, ... })` | adds an `<ozvi-widget>` with these options (attributes in camelCase) if there isn't one |
| `Ozvi.configure({...})` | same as `window.OzviConfig` (below) |
| `Ozvi.ready` | a Promise resolving to the API once `widget.js` has loaded; with the stub use `Ozvi("ready", fn)` |
| `Ozvi("open", "ideas")` | snippet-style call, works before and after load |

The element is a handle too: `document.querySelector("ozvi-widget").open("ideas")` (`open`, `close`, `toggle`, `prefill`).

**Events** (`Ozvi.on`, and as DOM events `ozvi:<name>` bubbling from `<ozvi-widget>`):

| Event | Detail |
|---|---|
| `open` | `{ tab }` |
| `close` | `{}` |
| `submit` | `{ kind: "bug" \| "idea", title }` before sending |
| `submitted` | `{ kind, number, url, pending }`: `pending` is `"approval"` or `"links"` when the post waits for the team's approval |
| `error` | `{ kind?: "bug" \| "idea" \| "vote", message }`; `message` is already in the widget's language |

```js
Ozvi.on("submitted", ({ kind, number, url, pending }) => analytics.track("feedback_sent", { kind, number, pending: !!pending }));
document.querySelector("#help-menu .feedback").addEventListener("click", () => Ozvi.open("ideas"));
Ozvi.prefill({ kind: "bug", title: "Export failed", body: `Invoice ${invoice.id}` }); Ozvi.open("bug");
```

Voting in the widget follows the board: simple or importance (1–3, the button cycles 0 → 1 → 2 → 3 → 0) and the vote
budget, all enforced by the server. Voting doesn't subscribe anyone to e-mails. Ideas from outside the team can wait
for approval; the widget says so and `submitted.pending` is set.

## Inline roadmap and changelog

```html
<ozvi-roadmap project="billiwo" limit="5"></ozvi-roadmap>
<ozvi-changelog project="billiwo" limit="3"></ozvi-changelog>
<ozvi-changelog project="billiwo" mode="badge" align="end"></ozvi-changelog>
```

They need `widget.js` on the page (it defines the tags and loads `widget-embeds.js` when one appears). Shadow DOM,
the project theme, keyboard and screen-reader friendly, and they reflow down to 320 px (lanes stack under 640 px).

| Attribute | |
|---|---|
| `project` | required |
| `host` | Ozvi base URL (default: where `widget.js` came from) |
| `lang` | `sk` / `cs` / `en` (default: `<html lang>`, then the browser) |
| `heading` | own heading text, or `none` to hide it (it stays for screen readers) |
| `limit` | roadmap: cards per lane (default 5); changelog: entries (default 5, max 20) |
| `lanes` | roadmap: `planned,in_progress,shipped` (any subset) |
| `mode` | changelog: `list` (default) or `badge`: a "What's new" button with the unseen count and a popover |
| `align` | changelog badge: `end` opens the popover to the left (button at the right edge) |
| `token-url` / `token` | only for boards whose ideas aren't public |

**Unseen count**: entries newer than the last one the person has seen. Stored in `localStorage` only (per Ozvi host,
project and person: `identify({ id })` or the id inside the SSO token, else anonymous); nothing is sent to Ozvi. The inline
list counts as seen after it has been on screen for a moment, the badge when it is opened. `<ozvi-changelog>` fires
`ozvi:unseen` with `{ count }`, so you can put the number on your own menu item:

```js
document.querySelector("ozvi-changelog").addEventListener("ozvi:unseen", (e) => (menuBadge.textContent = e.detail.count || ""));
```

Public boards serve the roadmap and changelog to any site (read-only, no cookies, no token). Boards with private ideas
answer only with a token, and only to origins in the project's allowed origins.

## npm: ESM, React, Vue

```js
import { loadOzvi, ozvi } from "@ozvi/widget";
loadOzvi({ host: "https://feedback.example.com", project: "acme", tokenUrl: "/api/ozvi-token" });
ozvi.open("ideas"); // queued until widget.js has loaded; a no-op on the server
```

```tsx
"use client"; // Next.js App Router: the hooks and components are client components
import { OzviWidget, OzviChangelog, OzviRoadmap, useOzvi, useOzviEvent } from "@ozvi/widget/react";

export function Feedback() {
  const ozvi = useOzvi();
  useOzviEvent("submitted", (d) => console.log("sent", d.number));
  return (
    <>
      <OzviWidget host="https://feedback.example.com" project="acme" tokenUrl="/api/ozvi-token" launcher="none" />
      <button onClick={() => ozvi.open("ideas")}>Ideas</button>
      <OzviChangelog host="https://feedback.example.com" project="acme" mode="badge" onUnseen={(n) => setBadge(n)} />
    </>
  );
}
```

```ts
// Vue 3 / Nuxt
import { OzviPlugin, OzviRoadmap, OzviChangelog, useOzvi, useOzviEvent } from "@ozvi/widget/vue";
app.use(OzviPlugin, { host: "https://feedback.example.com", project: "acme", tokenUrl: "/api/ozvi-token" });
// <OzviChangelog host="https://feedback.example.com" project="acme" :limit="3" @unseen="n => badge = n" />
// Using <ozvi-*> tags directly in templates: compilerOptions.isCustomElement = (tag) => tag.startsWith("ozvi-")
```

Types for everything (`OzviApi`, `OzviEvents`, `OzviOptions`, …) come with the package.

**SSR / Next.js**: importing is safe on the server; nothing touches `window` until an effect runs, the components render
plain custom-element tags (hydration-safe, the shadow DOM attaches after `widget.js` loads), and `ozvi.*` calls are
no-ops on the server. Give the token endpoint a route handler that signs with `@ozvi/sdk`:

```ts
// app/api/ozvi-token/route.ts
import { signOzviToken } from "@ozvi/sdk";
export async function GET() {
  const user = await currentUser(); // your auth
  if (!user) return new Response(null, { status: 401 });
  return Response.json({ token: signOzviToken({ id: user.id, email: user.email, name: user.name }, process.env.OZVI_SSO_SECRET!) });
}
```

The widget caches a token from `token-url` until a minute before it expires (10 minutes by default), so browsing ideas
and voting don't hit your endpoint on every click.

## Strict CSP

The widget runs under a nonce-based CSP without `unsafe-inline` or `unsafe-eval`:

- give the `<script>` a nonce (`<script nonce="…" src=".../widget.js">`, or `loadOzvi({ nonce })` / `<OzviWidget nonce>`).
  `widget.js` passes it on to every script it loads on demand and to every `<style>` it adds (inside its shadow roots and
  the screenshot's temporary blur style); with `'strict-dynamic'` nothing else is needed for scripts;
- or set it explicitly: `window.OzviConfig = { nonce: "…" }`.

Directives the widget needs (replace the host with yours):

```
script-src 'nonce-RANDOM' 'strict-dynamic' https://feedback.example.com;
style-src 'nonce-RANDOM' https://feedback.example.com;
font-src https://feedback.example.com;
connect-src https://feedback.example.com;
img-src 'self' blob: data: https://feedback.example.com;
```

`style-src` lists the Ozvi host for the font stylesheet (`/fonts/css`); `img-src blob: data:` is for the screenshot
preview. Inline `style` attributes are never used in markup (only through CSSOM, which CSP allows).

## What a bug report captures

Everything below is kept **in memory only**, is **masked in the browser before it is kept**, and leaves the page
**only when the person sends a bug report**. The reporter can untick "Attach the request log and recent steps"
before sending. The network log, steps and session links are visible **to the project team only** (not to the
reporter on the board, not in webhooks or GitHub issues); the Ozvi server masks and bounds them again.

| What | Detail | Never |
|---|---|---|
| Page | URL (masked), app version, browser, window size, language | |
| Screenshot | visible viewport without the widget; private data **covered with solid boxes before the image is made** (see [Screenshot privacy](#screenshot-privacy)); the reporter can mark it up, blur more (burned into the pixels) or remove it | form values, e-mails, phone numbers, IBANs, card numbers, tokens, `[data-ozvi-mask]` |
| Console errors | last 20, 300 characters each | |
| Network log | last 30 `fetch`/`XMLHttpRequest` calls: method, URL, status, duration, size, failed flag | request/response headers (so no `Authorization`, no `Cookie`); bodies unless you turn them on |
| Request bodies | only with `networkBodies: true`, only for **failed** requests, masked, max 2 000 characters each | bodies of successful requests |
| Steps | last 30: route changes, clicks on buttons/links/tabs by accessible name, form submits by form name | what anyone typed: input, textarea and select values are never read |
| Session links | Sentry replay, PostHog session, LogRocket session, when you pass them or allow detection | |

**Masking** (in `@ozvi/sdk/mask`, the same code runs in the browser and on the server):

- query/fragment parameters, JSON keys (at any depth) and form fields whose **name** matches
  `token|secret|passw|pwd|key|auth|session|card|iban|cvv|cvc|otp|signature|cookie|csrf|xsrf|jwt|bearer|ssn|credential`
  get the value `***`;
- in any value: JWTs, `Bearer`/`Basic` credentials, e-mail addresses, IBANs and card numbers (Luhn-checked) become `***`;
- `user:password@` is removed from URLs;
- clicks inside `[data-ozvi-mask]` are logged as `***`, and masked parts of a button's text are replaced by `***`.

Requests to Ozvi itself and to your `token-url` are never logged.

## Screenshot privacy

The screenshot is drawn from a **copy** of the page that the widget edits first; the page the person
sees is never touched, and what is covered never becomes pixels (covered text is drawn transparent on a
solid box, covered images are not drawn). Nothing to set up for the common cases:

| Covered automatically | How |
|---|---|
| Values of every `input`, `textarea`, `select` and `contenteditable` | shown as `•••••` or a box; checkboxes and radios keep their state |
| E-mail addresses, phone numbers (9–15 digits), IBANs, card numbers (Luhn-checked), JWTs and `Bearer`/`Basic` credentials in any text | the match is boxed, the rest of the sentence stays readable |
| Everything inside `[data-ozvi-mask]` | text, images, canvas and video of the element, boxed |

Shapes can't find everything: **mark names, notes, diagnoses, amounts or anything else private** with
`data-ozvi-mask`:

```html
<td data-ozvi-mask>Jana Kováčová</td>
<p data-ozvi-mask>{{ client.note }}</p>
```

For apps where almost everything on screen is private (health, finance, HR), cover **all** text and
images and reveal only the parts that help the team, such as navigation and headings:

```js
window.OzviConfig = { mask: "all" };
```
```html
<nav data-ozvi-unmask>…</nav>
<h1 data-ozvi-unmask>Invoice settings</h1>
```

If the copy can't be masked (an unexpected error), the report goes **without** a screenshot, never with
an unmasked one. The reporter still sees the screenshot before sending and can remove it.

## Configuration

Simple switches as attributes:

| Attribute | Effect |
|---|---|
| `network="off"` | no network log |
| `network="bodies"` | also keep masked bodies of failed requests |
| `actions="off"` | no step timeline |
| `links="auto"` | detect Sentry / PostHog / LogRocket session links from their globals |

Everything else via `window.OzviConfig` (set it **before** `widget.js` so the first requests are covered) or
`Ozvi.configure({...})` later:

```js
window.OzviConfig = {
  network: true,          // false = no network log
  networkBodies: false,   // true = masked bodies of failed requests (max 2 000 chars)
  actions: true,          // false = no step timeline
  // Last word on every logged request, after the built-in masking (which runs again afterwards).
  // Return the entry (changed or not), or null to drop it.
  maskRequest(entry) {
    if (entry.url.includes("/internal/")) return null;
    return { ...entry, url: entry.url.replace(/\/customers\/\d+/, "/customers/:id") };
  },
  // Session links shown to the team as buttons; a function is called when the report is sent.
  links: {
    sentry: () => `https://acme.sentry.io/replays/${Sentry.getReplay()?.getReplayId()}/`,
    posthog: () => posthog.get_session_replay_url({ withTimestamp: true }),
    logrocket: () => LogRocket.sessionURL,
  },
  detectLinks: false,     // true = read them from window.Sentry / posthog / LogRocket yourself
  sentryOrg: "acme",      // needed for the detected Sentry replay URL (https://<org>.sentry.io/replays/<id>/)
  mask: "auto",           // "all" = screenshots cover all text and images except [data-ozvi-unmask]
};
```

A `maskRequest` that throws drops the entry (it never leaks what it meant to hide). Only `http(s)` session links
are accepted.

## Screenshot mark-up

"Mark up" on the screenshot opens the editor (`widget-annotate.js`, ~4 kB gzip, loaded on click): box, arrow,
highlight, blur. Keyboard: pick a tool, focus the image, **Enter** adds the shape in the middle, **arrows** move it,
**Shift+arrows** resize it, **Delete** removes it, **Ctrl/Cmd+Z** undoes, **Escape** or "Use as is" skips the mark-up.
The marked-up JPEG replaces the original, so blurred areas never leave the browser.
