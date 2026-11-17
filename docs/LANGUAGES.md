# Ozvi languages

Ozvi speaks **Slovak** (the source; `messages/sk.json` types the keys), **Czech**, **English** (British) and, since wave 3, also **Polish**, **Hungarian** and **German**.

| Language | Code / BCP 47 | Landing | Status |
|---|---|---|---|
| Slovak | `sk` / `sk-SK` | `/` | source |
| Czech | `cs` / `cs-CZ` | `/cs` | done |
| English | `en` / `en-GB` | `/en` | done |
| Polish | `pl` / `pl-PL` | `/pl` | **machine-prepared, needs a native review before launch** |
| Hungarian | `hu` / `hu-HU` | `/hu` | **machine-prepared, needs a native review before launch** |
| German | `de` / `de-DE` | `/de` | **machine-prepared, needs a native review before launch** |

Where the language is chosen: the landing page by path (hreflang to all languages), the console and boards by the `NEXT_LOCALE` cookie → `Accept-Language` (including `de-AT`, `pl-PL`…) → the board's default language. A board offers only the languages enabled in admin → Languages. E-mails go out in the user's saved language (if the board still offers it). Widget: sk/cs/en are built into `widget.js`, pl/hu/de are loaded as `widget-lang-<language>.js` before the first render (`packages/widget/src/lang/`), so the user never sees a different language.

## Adding a key

Add new text to `sk.json`, `cs.json`, `en.json` **and** `pl.json`, `hu.json`, `de.json`; `messages.test.ts` guards that the keys match and the ICU is valid (Polish plurals `one/few/many/other`, Hungarian and German `one/other`). Widget: a new key in the `T` table also belongs in `packages/widget/src/lang/{pl,hu,de}.ts` (`lang-pack.test.ts`).

## Before launching PL/HU/DE: native review

The texts were translated by Claude following the glossaries in [`languages/`](languages/) (GLOSSARY-pl/hu/de.md: chosen terms, form of address, open questions). The reviewer should go through the screens, not just the JSON. Form of address: **PL** “ty” (no Pan/Pani, no gendered past-tense forms), **HU** informal (“te”), **DE** “Sie”.

### Common to all three

- **Sentences assembled from pieces** (word order, grammatical cases): `account.invite.invitesYou`/`as`/`roleAs.*`; `email.onBug`/`onIdea` with `commentSummary`, `noteSummary`, `commentLead`, `commentQueued*`; `integrations.gh.provenance` + `gh.trust.*` + `gh.source.*`; `integrations.tracker.comment*`; texts split around `<code>`: `admin.login.maskA/B`, `admin.integrations.mcpA–C`, `admin.limits.mailOffA–C`, `admin.people.textA/B`, `admin.tokens.codeA/B`.
- **Stage names** (`route.label.*`): PL Zaproponowane / Zaplanowane / W realizacji / Wdrożone / Odrzucone, bugs Przyjęte / Potwierdzone / Naprawione / Zweryfikowane / Nie będziemy naprawiać; HU Javasolt / Tervezett / Folyamatban / Elkészült / Elutasítva, Beérkezett / Megerősítve / Javítva / Ellenőrizve / Nem javítjuk; DE Vorgeschlagen / Geplant / In Arbeit / Umgesetzt / Abgelehnt, Eingegangen / Bestätigt / Behoben / Verifiziert / Wird nicht behoben. Confirm especially DE “Umgesetzt” (vs. “Ausgeliefert”) and PL “Nie będziemy naprawiać” (long).
- **Marketing**: `landing.hero.*`, `landing.dev.title`, `playground.title`.
- **Legal / market** (the owner's decision, not the translator's):
  - `account.legalNote`: the Slovak version is binding – does that also apply to PL/HU/DE customers?
  - `a11y.page.enforcement`: PL added the Polish accessibility act (Dz.U. 2024 poz. 731) – verify; HU and DE cite only the SK and CZ acts (for DE/AT consider BFSG/BaFG, for HU the Hungarian act).
  - `subprocessors.*`: translation of a draft no lawyer has seen yet (the TODOs remain).
  - Prices in EUR and “excl. VAT” (`landing.pricing.*`, `console.plan.vat`); the PL demo shows “1200,00 €” – consider PLN.
- **Localised examples**: Xero → KSeF (PL), DATEV (DE), “könyvelőprogram” (HU); IČ DPH → NIP / USt-IdNr. / adószám; sample domains and names.

### Polish

`forms.vote.level1` (“Miło by było” / “Przydałoby się”), “Triaż” in `admin.scope.triage` and related keys, days in `board.unanswered.*`, `email.teamDigestUnanswered`, `admin.statuses.daysSaved`, `email.releaseDraftBody` (rewritten because of a negative construction), Jira inflected (Jirę/Jiry), `integrations.tracker.acc.jira` left in the nominative (“Jira”) because of the different cases in `connect`/`disconnect`.

### Hungarian

Placeholders never carry a suffix (sentences are rephrased to “…: {x}” or “a(z)”) – check the flow. `admin.retention.preview.files` (n=1), `integrations.tracker.issueLabel`, `route.label.shipped` (“Elkészült” vs. “Kiadva”), “AI” instead of “MI”. Widget: “Maradt: l/t pont”.

### German

Short masculine forms (“Nutzer”, “Verfasser”) in `board.user`, `board.customers.anonymous`, `integrations.people.roles.member`, `moderation.blockAuthor`; `forms.vote.level1–3`; “Kundenerkenntnis” in `integrations.insight.heading`; the Fider/Canny/GitHub/Linear/Jira menus stayed in English.
