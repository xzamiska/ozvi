# Jazyky Ozvi

Ozvi hovorí **slovensky** (zdroj, `messages/sk.json` typuje kľúče), **česky**, **anglicky** (britsky) a od vlny 3 aj **poľsky**, **maďarsky** a **nemecky**.

| Jazyk | Kód / BCP 47 | Landing | Stav |
|---|---|---|---|
| slovenčina | `sk` / `sk-SK` | `/` | zdroj |
| čeština | `cs` / `cs-CZ` | `/cs` | hotové |
| angličtina | `en` / `en-GB` | `/en` | hotové |
| poľština | `pl` / `pl-PL` | `/pl` | **strojovo pripravené, pred spustením treba natívnu revíziu** |
| maďarčina | `hu` / `hu-HU` | `/hu` | **strojovo pripravené, pred spustením treba natívnu revíziu** |
| nemčina | `de` / `de-DE` | `/de` | **strojovo pripravené, pred spustením treba natívnu revíziu** |

Kde sa jazyk vyberá: landing podľa cesty (hreflang na všetky jazyky), konzola a boardy podľa cookie `NEXT_LOCALE` → `Accept-Language` (aj `de-AT`, `pl-PL`…) → predvolený jazyk boardu. Board ponúka len jazyky zapnuté v admin → Jazyky. E-maily idú v uloženom jazyku používateľa (ak ho board stále ponúka). Widget: sk/cs/en sú priamo vo `widget.js`, pl/hu/de sa načítajú ako `widget-lang-<jazyk>.js` ešte pred prvým vykreslením (`packages/widget/src/lang/`), takže používateľ nikdy nevidí iný jazyk.

## Pridanie kľúča

Nový text pridaj do `sk.json`, `cs.json`, `en.json` **a** `pl.json`, `hu.json`, `de.json`; `messages.test.ts` stráži rovnaké kľúče a platné ICU (poľské plurály `one/few/many/other`, maďarské a nemecké `one/other`). Widget: nový kľúč v tabuľke `T` patrí aj do `packages/widget/src/lang/{pl,hu,de}.ts` (`lang-pack.test.ts`).

## Pred spustením PL/HU/DE: natívna revízia

Texty preložil Claude podľa slovníkov v [`languages/`](languages/) (GLOSSARY-pl/hu/de.md: zvolené termíny, oslovenie, otvorené otázky). Recenzent by mal prejsť obrazovky, nielen JSON. Oslovenie: **PL** „ty“ (bez Pan/Pani, bez rodových tvarov minulého času), **HU** tykanie („te“), **DE** „Sie“.

### Spoločné pre všetky tri

- **Vety skladané z kúskov** (poradie slov, pády): `account.invite.invitesYou`/`as`/`roleAs.*`; `email.onBug`/`onIdea` s `commentSummary`, `noteSummary`, `commentLead`, `commentQueued*`; `integrations.gh.provenance` + `gh.trust.*` + `gh.source.*`; `integrations.tracker.comment*`; texty rozdelené okolo `<code>`: `admin.login.maskA/B`, `admin.integrations.mcpA–C`, `admin.limits.mailOffA–C`, `admin.people.textA/B`, `admin.tokens.codeA/B`.
- **Názvy zastávok** (`route.label.*`): PL Zaproponowane / Zaplanowane / W realizacji / Wdrożone / Odrzucone, chyby Przyjęte / Potwierdzone / Naprawione / Zweryfikowane / Nie będziemy naprawiać; HU Javasolt / Tervezett / Folyamatban / Elkészült / Elutasítva, Beérkezett / Megerősítve / Javítva / Ellenőrizve / Nem javítjuk; DE Vorgeschlagen / Geplant / In Arbeit / Umgesetzt / Abgelehnt, Eingegangen / Bestätigt / Behoben / Verifiziert / Wird nicht behoben. Potvrdiť najmä DE „Umgesetzt“ (vs. „Ausgeliefert“) a PL „Nie będziemy naprawiać“ (dlhé).
- **Marketing**: `landing.hero.*`, `landing.dev.title`, `playground.title`.
- **Právne / trh** (rozhodnutie vlastníka, nie prekladateľa):
  - `account.legalNote`: záväzná je slovenská verzia – platí to aj pre PL/HU/DE zákazníkov?
  - `a11y.page.enforcement`: PL doplnila poľský zákon o prístupnosti (Dz.U. 2024 poz. 731) – overiť; HU a DE uvádzajú len SK a CZ zákon (pre DE/AT zvážiť BFSG/BaFG, pre HU maďarský zákon).
  - `subprocessors.*`: preklad konceptu, ktorý ešte nevidel právnik (TODO ostali).
  - Ceny v EUR a „bez DPH“ (`landing.pricing.*`, `console.plan.vat`); PL demo ukazuje „1200,00 €“ – zvážiť PLN.
- **Lokalizované ukážky**: Xero → KSeF (PL), DATEV (DE), „könyvelőprogram“ (HU); IČ DPH → NIP / USt-IdNr. / adószám; ukážkové domény a mená.

### Poľština

`forms.vote.level1` („Miło by było“ / „Przydałoby się“), „Triaż“ v `admin.scope.triage` a súvisiacich, dni v `board.unanswered.*`, `email.teamDigestUnanswered`, `admin.statuses.daysSaved`, `email.releaseDraftBody` (prepísané kvôli zápornej väzbe), Jira skloňovaná (Jirę/Jiry), `integrations.tracker.acc.jira` ponechané v nominatíve („Jira“) kvôli rôznym pádom v `connect`/`disconnect`.

### Maďarčina

Zástupné symboly nikdy nenesú príponu (vety sú preformulované na „…: {x}“ alebo „a(z)“) – skontrolovať plynulosť. `admin.retention.preview.files` (n=1), `integrations.tracker.issueLabel`, `route.label.shipped` („Elkészült“ vs. „Kiadva“), „AI“ namiesto „MI“. Widget: „Maradt: l/t pont“.

### Nemčina

Krátke mužské tvary („Nutzer“, „Verfasser“) v `board.user`, `board.customers.anonymous`, `integrations.people.roles.member`, `moderation.blockAuthor`; `forms.vote.level1–3`; „Kundenerkenntnis“ v `integrations.insight.heading`; menu Fideru/Canny/GitHub/Linear/Jira ostali po anglicky.
