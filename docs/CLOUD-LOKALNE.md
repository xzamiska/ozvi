# Cloud lokálne

Cloudový režim (registrácia, priestory, ľudia, plány, platby, subdomény, vlastné domény) sa dá celý vyskúšať na vlastnom počítači, bez Creem účtu a bez DNS.

```bash
pnpm dev:cloud
```

Skript `scripts/dev-cloud.sh`:

- spustí Docker (Postgres a Mailpit),
- založí samostatnú databázu `ozvi_cloud`, takže dáta z `pnpm dev` ostanú bez zmeny,
- spustí migrácie a web na **http://ozvi.localhost:3400**.

Môže bežať súčasne so self režimom (`pnpm dev` na :3300). Nastavenia sú v `.env.cloud`, ktorý vznikne pri prvom spustení z `.env.cloud.example` a prepisuje hodnoty z `.env`.

Prehliadač: **Chrome alebo Firefox**. Adresy `*.localhost` smerujú na váš počítač bez úpravy systému. Safari ich nepozná.

## Čo kde vyskúšať

| Čo | Ako |
|---|---|
| Registrácia a prihlásenie | http://ozvi.localhost:3400/app/login, ľubovoľný e-mail (napr. `ja@firma.test`). Kód aj odkaz sú v **Mailpite: http://localhost:8046** |
| Projekt | Po prihlásení „Vitajte v Ozvi“ → názov a adresa. Board je na `ozvi.localhost:3400/<slug>` aj na **`<slug>.ozvi.localhost:3400`** |
| Konzola | Po prihlásení `/app` otvorí konzolu priestoru: **Prehľad** (projekty s počtami nových chýb, nápadov a komentárov, využitie plánu, posledná aktivita), **Ľudia**, **Plán a využitie**, **Doručovanie** (log e-mailov a webhookov, filter „Len problémy“), **Aktivita** (kto čo zmenil). Z boardu sa vrátite cez „Moje projekty“ v hlavičke |
| Ukážkové dáta | `pnpm db:demo:cloud [slug]` naplní projekt (predvolene `fakturnik`) používateľmi, nápadmi, chybami, komentármi, e-mailami (aj nedoručeným), volaniami webhooku a aktivitou. Beží len proti `ozvi_cloud` a len raz na projekt |
| Ľudia v priestore | Konzola → **Ľudia** → pozvať e-mail. Pozvánka príde do Mailpitu. Po kliknutí na odkaz sa prihlásite ako pozvaný. Vyskúšajte aj roly, odobratie a „Odísť z priestoru“ |
| Platby | Konzola → **Plán a využitie** → „Prejsť na Pro“ otvorí **simuláciu platobnej brány** namiesto Creem. Tlačidlá posielajú vymyslené udalosti cez ten istý kód ako skutočný webhook: zaplatenie, obnovenie, zlyhaná platba, zrušenie ku koncu obdobia, vypršanie |
| Vlastná doména | Na Pro: nastavenia projektu → Vlastná doména, napr. `feedback.mojafirma.localhost`. Overenie DNS je simulované (`OZVI_DEV_DNS=1`). Domény `*.localhost` Chrome posiela na 127.0.0.1 sám, takže board hneď beží na http://feedback.mojafirma.localhost:3400. Iná doména (napr. `.test`) potrebuje riadok v `/etc/hosts`, inak board z konzoly neotvoríte |
| Môj účet | Menu vpravo hore → Môj účet: meno, zmena e-mailu (odkaz príde na novú adresu), odhlásenie všade, zrušenie účtu |
| Právne texty | http://ozvi.localhost:3400/terms a `/privacy` (návrhy, údaje prevádzkovateľa doplniť v `apps/web/src/lib/legal.ts`) |
| AI (Studio) | Do `.env.cloud` pridajte `OZVI_AI_PROVIDER=anthropic` a `OZVI_AI_API_KEY`, simuláciou prejdite na Studio |

## Skutočný Creem sandbox namiesto simulácie

V `.env.cloud` nastavte:

- `OZVI_DEV_BILLING=0`,
- `CREEM_TEST=1`,
- `CREEM_API_KEY` a `CREEM_WEBHOOK_SECRET`,
- id produktov `CREEM_PRODUCT_*`.

Webhook z Creem musí doraziť na váš počítač, napríklad cez `cloudflared tunnel --url http://localhost:3400`. Webhook URL v Creem potom je `<tunel>/api/creem`.

## Od nuly

```bash
pnpm db:reset:cloud   # zmaže databázu ozvi_cloud
pnpm dev:cloud        # založí ju znova
```

Simulácia platieb a DNS funguje len mimo produkcie (`NODE_ENV !== "production"`). Ani nastavená premenná ju v produkčnom image nezapne.
