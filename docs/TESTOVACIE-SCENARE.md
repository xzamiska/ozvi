# Testovacie scenáre (regresia)

Čo Ozvi robí z pohľadu ľudí, ktorí ho používajú, a kde to stráži test. Dve vrstvy:

- **Unit a integračné testy** (`pnpm test`, vitest): logika, databáza, RLS, import, SDK, widget bez prehliadača.
- **Testy v prehliadači** (`apps/e2e`, Playwright): celé toky tak, ako ich preklikne človek, v **Chromiu aj WebKite** (jadro Safari), vybrané aj na iPhone (`@mobile`). Bežia proti samostatnej inštancii (`scripts/e2e-server.sh`: vlastná databáza `ozvi_e2e`, produkčný build, e-maily v Mailpite).

```sh
docker compose up -d                       # Postgres + Mailpit
pnpm --filter @ozvi/e2e e2e                 # spustí inštanciu aj testy
pnpm --filter @ozvi/e2e e2e -- --project=webkit tests/board.spec.ts
```

Stav: ✅ automatizované · 🧪 len unit/integračný test · ⬜ zatiaľ ručne.

## 1. Konzola: prihlásenie a projekty (`console-auth.spec.ts`)

| Scenár | Stav |
|---|---|
| Nová adresa: kód z e-mailu → účet → prvý projekt → board | ✅ |
| Odkaz z e-mailu prihlási až po kliknutí (skener ho nespotrebuje), funguje raz | ✅ |
| Nesprávny kód sa odmietne s hláškou | ✅ |
| Vyhradená adresa projektu (`admin`, …) sa odmietne | ✅ |
| 5 pokusov na kód, limit pokusov z IP | 🧪 |

## 2. Tím a pozvánky (`team-invites.spec.ts`)

| Scenár | Stav |
|---|---|
| Pozvánka člena: e-mail → potvrdenie → člen, práva člena (bez pozývania a plánu, s nastaveniami boardu), odkaz raz | ✅ |
| Pozvánka vlastníka: e-mail hovorí o pláne a pozývaní, nový vlastník pozýva a mení plán | ✅ |
| Člena už v tíme nejde pozvať; zmena roly; odobratie (stratí konzolu aj board); zrušenie pozvánky zneplatní odkaz | ✅ |
| Posledný vlastník nemôže odísť | ✅ |
| Nová pozvánka nahradí starú, max. otvorených pozvánok | 🧪 |

## 3. Board pre používateľov (`board.spec.ts`)

Nápady (vytvorenie, schvaľovanie, hlasovanie jednoduché aj podľa dôležitosti, komentáre, hľadanie), zmena stavu a e-maily hlasujúcim, roadmapa, novinky a RSS, súkromné hlásenia chýb (cudzí ich nevidí ani cez priamu adresu), moderovanie, zlúčenie duplicít, odhlásenie z e-mailov jedným klikom, „Moje údaje“ (export, výmaz), prihlásenie e-mailom na board, jazyk boardu, `noindex`, staré odkazy z Fideru.

## 4. Prihlásenie z appky a widget (`sso-widget.spec.ts`)

SSO token (návrat, expirácia, podvrh, ochrana pred open redirect, roly z tokenu, odhlásenie pri strate roly, medzistránka pri prepnutí účtu, jazyk z tokenu, prechod z konzoly ako admin, vlastník prihlásený z konzoly ostane adminom aj po otvorení boardu z appky s tou istou overenou adresou). Widget na cudzej stránke: okamžité otvorenie formulára so screenshotom na pozadí, maskovanie, odoslanie s kontextom (konzola, sieť, maskované tajomstvá), nápady a hlasovanie vo widgete, `launcher="none"`, `position="bottom-left"`, `::part()`, udalosti, iPhone, odmietnutie nepovoleného originu (hlásenie aj zoznam nápadov to vysvetlia).

## 5. Nastavenia boardu a integrácie (`admin.spec.ts`)

Každá sekcia admina sa uloží a prejaví na boarde (vzhľad vrátane „Logo už obsahuje názov“, projekt, časti, hlasovanie, jazyky, štítky, stavy), SSO (stav sa ukáže hneď po zapnutí, výmena tajomstva zneplatní starý token), vlastná doména, ľudia, webhooky (ochrana pred SSRF), API tokeny a REST API, MCP bez tokenu, import CSV s návratom, export, uchovávanie dát, zmazanie projektu.

## 6. Konzola, plány a verejný web (`console-billing-site.spec.ts`)

Limity plánov (Free 1 projekt, jeden free priestor na osobu aj pri Gmail aliasoch), simulovaná platba Pro/Studio a zmena limitov, premenovanie a zmazanie priestoru, zmena e-mailu účtu, odhlásenie všade, zmazanie účtu, aktivita a doručovanie. Verejný web vo všetkých jazykoch bez chýb v konzole, český prehliadač na `/` dostane `/cs` (pohyb po webe nepresmeruje), blok „Sentry vidí kód“ s porovnaním a časté otázky, odkazy, dokumentácia, právne stránky, sitemap/robots, `noindex` na boardoch a v konzole, 404, mobil bez vodorovného posúvania.

## Ručne / mimo automatizácie

- Skutočné Safari s prihlásením do hostiteľskej appky (overené ručne cez AppleScript na billiwo.com, 15. 11. 2026).
- Skutočné Safari: vytvorenie nápadu, obnovenie detailu a prechod na zoznam (overené ručne na stagingu, 16. 11. 2026; v automatizovanom WebKite občas „Page crashed“, v Safari sa nedeje).
- Platby cez skutočný Creem (len testovací režim Creemu na stagingu).
- OIDC s externým poskytovateľom, GitHub App, Linear, Jira (potrebujú externé účty).
- E-maily v klientoch (Gmail, Outlook) – vzhľad.
