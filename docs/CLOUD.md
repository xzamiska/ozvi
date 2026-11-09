# Cloud režim (ozvi.io)

Rovnaký image ako self-host, len `OZVI_MODE=cloud`. Čo sa tým zapne:

- **Úvodná stránka** na `/` a **registrácia** v `/app` (kód alebo odkaz do e-mailu, bez hesla). Každý nový účet dostane priestor (workspace) na pláne Free.
- **Konzola** `/app/w/<id>`: Prehľad, Ľudia, Plán a využitie (len cloud), Doručovanie (log tabuliek `emails` a `webhook_deliveries` naprieč projektmi), Aktivita (tabuľka `activity`: pozvánky, roly, plán, domény, tokeny, webhooky, OIDC, téma). Konzola je aj v self-hoste, okrem plánu.
- **Plány** (`packages/db/src/plans.ts`): Free 1 projekt, Pro 3, Studio neobmedzene; e-maily, prílohy, vlastná doména, odznak „Ozvi“ a AI (embeddingy) podľa plánu. MCP, GitHub, webhooky, SSO/OIDC sú vo všetkých plánoch (ADR-0001).
- **Webhooky a OIDC** nesmú smerovať do internej siete (kontrola aj pri DNS lookup-e).

Lokálne vyskúšanie celého cloudu: [CLOUD-LOKALNE.md](CLOUD-LOKALNE.md).

## Premenné

| Premenná | Význam |
|---|---|
| `OZVI_MODE=cloud` | cloud správanie |
| `PUBLIC_URL=https://ozvi.io` | primárna adresa (board `ozvi.io/<slug>`, `/app`) |
| `OZVI_CLOUD_DOMAIN=ozvi.io` | projekty odpovedajú aj na `<slug>.ozvi.io` |
| `OZVI_CNAME_TARGET=domains.ozvi.io` | kam zákazníci smerujú CNAME vlastnej domény |
| `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_TEST=1` | platby; webhook URL `https://ozvi.io/api/creem` |
| `CREEM_PRODUCT_PRO_YEAR`, `…_PRO_QUARTER`, `…_STUDIO_YEAR`, `…_STUDIO_QUARTER` | id produktov v Creem |
| `SMTP_URL`, `OZVI_MAIL_FROM` | náš Resend (kódy na prihlásenie aj notifikácie); e-maily v cloude posielame my, preto ich obmedzujú plány. Alternatíva: `ECOMAIL_API_KEY` |

## Nasadenie

Edge Caddy, staging a live na jednej VM, certifikáty na požiadanie pre `<projekt>.ozvi.io` a vlastné domény, staging za basic auth: [deploy/cloud](../deploy/cloud/README.md). `/api/domains/ask` odpovie 200 len pre overené vlastné domény projektov s plánom, ktorý ich obsahuje, a pre existujúce `<slug>.<OZVI_CLOUD_DOMAIN>`.

## Platby (Creem)

1. V Creem vytvorte 4 produkty (Pro/Studio × rok/štvrťrok, ceny z `PRICES`), predplatné, bez mesačných.
2. Webhook `https://ozvi.io/api/creem`, udalosti `checkout.completed` a `subscription.*`.
3. Plán sa mení **len** z overeného webhooku. Zmena plánu pri aktívnom predplatnom ide cez portál zákazníka (žiadne druhé predplatné).
4. Po vypršaní predplatného: priestor prejde na Free, vlastné domény sa zrušia (treba znova overiť po upgrade), projekty ani dáta sa nemažú — len nové nad limit nejdú založiť.

## Migrácia existujúceho self-host projektu do cloudu (napr. Billiwo)

1. V cloude založiť účet a projekt s rovnakým slugom (`billiwo`).
2. Import z Fideru rovnako ako pri self-hoste (`import:fider --project billiwo`) — spustiť proti cloudovej DB z operátorského kontajnera.
3. Nastavenia → Vlastná doména `feedback.billiwo.com` → CNAME na `OZVI_CNAME_TARGET` → Overiť.
4. V appke vymeniť `OZVI_URL` a `OZVI_SSO_SECRET` (nový secret z Nastavení).
