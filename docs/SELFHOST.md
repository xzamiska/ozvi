# Self-host

Dva kontajnery: Postgres 17 a Ozvi (plus voliteľný updater, pozri [Aktualizácie](#aktualizácie)). Pred port 3000 dajte TLS proxy (Caddy, Traefik).

```sh
cd deploy
cp .env.example .env          # doplňte heslá a PUBLIC_URL
docker compose up -d          # migrácie prebehnú pri štarte
docker compose exec ozvi node ozvi.mjs project:create mojaappka "Moja appka" --origin https://app.example.com
```

- **Postgres rola appky nie je superuser** (`deploy/initdb/01-ozvi.sh`). Superuser by obišiel row-level security; `/api/health` v takom prípade vráti 500 s `"rls":"bypassed"`.
- **E-maily — vlastný SMTP je na prevádzkovateľovi.** Ozvi neposiela cez nás; nastavte `SMTP_URL` na svoj server alebo službu so SMTP:

  | Služba | `SMTP_URL` |
  |---|---|
  | Resend | `smtp://resend:<API_KEY>@smtp.resend.com:587` |
  | Postmark | `smtp://<TOKEN>:<TOKEN>@smtp.postmarkapp.com:587` |
  | Amazon SES | `smtp://<USER>:<PASS>@email-smtp.eu-central-1.amazonaws.com:587` |
  | Brevo | `smtp://<LOGIN>:<KEY>@smtp-relay.brevo.com:587` |
  | vlastný server | `smtp://user:pass@mail.firma.sk:587` (alebo `smtps://…:465`) |

  **Ecomail** (len API, bez SMTP): namiesto `SMTP_URL` nastavte `ECOMAIL_API_KEY` (platený účet, overená doména odosielateľa). Sledovanie klikov a otvorení je vypnuté; API neumožňuje vlastné hlavičky, takže chýba `List-Unsubscribe` — odhlasovací odkaz ostáva v pätičke každého e-mailu.

  `OZVI_MAIL_FROM` musí byť adresa z domény overenej u služby (SPF + DKIM), inak e-maily skončia v spame. Odosielateľ sa zobrazí ako názov projektu („Billiwo“ &lt;feedback@billiwo.com&gt;). Bez `SMTP_URL` appka funguje, len notifikácie sa zalogujú ako `skipped` a Nastavenia to ukážu. V self-hoste nie je limit e-mailov.
- **Prílohy:** volume `uploads` (`/data/uploads`), alebo S3-kompatibilné úložisko cez `S3_*`.
- **Kľúče:** `OZVI_SECRET_KEY` šifruje SSO secrety v DB — ak ho stratíte, vygenerujte projektom nové secrety v Nastaveniach. `OZVI_SESSION_SECRET` podpisuje cookies a odhlasovacie odkazy v e-mailoch.
- **Proxy:** `OZVI_TRUSTED_PROXIES` = počet proxy pred Ozvi (default 1). Rate limit berie IP z `X-Forwarded-For` len od nich, nie čo pošle klient.
- **Zálohy:** `pg_dump` databázy + volume `uploads`.
- **AI pomocník (voliteľné):** zhrnutie diskusie, návrhy noviniek, týždenný prehľad, preklad príspevkov. Výstup je vždy návrh, ktorý schváli človek ([AI.md](AI.md)). Ľubovoľný poskytovateľ:

  | Poskytovateľ | Nastavenie |
  |---|---|
  | OpenAI | `OZVI_AI_PROVIDER=openai` `OZVI_AI_API_KEY=sk-…` `OZVI_AI_MODEL=gpt-4o-mini` |
  | Mistral (EÚ) | `OZVI_AI_PROVIDER=openai` `OZVI_AI_BASE_URL=https://api.mistral.ai/v1` `OZVI_AI_API_KEY=…` `OZVI_AI_MODEL=mistral-small-latest` |
  | Ollama (lokálne, bez kľúča) | `OZVI_AI_PROVIDER=openai` `OZVI_AI_BASE_URL=http://ollama:11434/v1` `OZVI_AI_MODEL=qwen2.5:14b` |
  | Azure OpenAI, OpenRouter, Groq, vLLM, LM Studio | `OZVI_AI_PROVIDER=openai` + ich `/v1` adresa, kľúč a model |
  | Anthropic (Claude) | `OZVI_AI_PROVIDER=anthropic` `OZVI_AI_API_KEY=sk-ant-…` (model predvolene `claude-opus-5-5`, inak `OZVI_AI_MODEL`) |

  `OZVI_AI_MODEL_FAST` = voliteľný lacnejší model na preklady. Starší `ANTHROPIC_API_KEY` funguje ďalej ako `anthropic`. Bez nastavenia (alebo `OZVI_AI_PROVIDER=off`) appka funguje bez AI. Pri `openai` musí model zvládať aspoň JSON v odpovedi; štruktúrovaný výstup (`json_schema`) sa použije, keď ho server podporuje. Poskytovateľa uveďte vo svojich zásadách ochrany súkromia ako subdodávateľa (lokálny model nie).
- **AI duplicity (voliteľné):** `OZVI_EMBEDDINGS_URL` + `OZVI_EMBEDDINGS_MODEL` (+ `OZVI_EMBEDDINGS_KEY`) — ľubovoľné API kompatibilné s OpenAI `/embeddings` (OpenAI, Ollama, LM Studio, vLLM). Pri `OZVI_AI_PROVIDER=openai` stačí `OZVI_EMBEDDINGS_MODEL` (adresa a kľúč sa prevezmú). Worker zaindexuje záznamy na pozadí; bez nastavenia sa duplicity hľadajú fuzzy porovnaním textu (pg_trgm). Rozšírenie `vector` vytvára `initdb` skript; ak chýba, embeddingy sa preskočia.
- **Webhooky:** v self-hoste smú smerovať aj do internej siete (Mattermost, n8n na LAN); v cloud režime (`OZVI_MODE=cloud`) sú interné adresy blokované.
- **Správa cez `/app` (voliteľné):** `OZVI_ADMIN_EMAILS=vy@firma.sk` — tieto e-maily sa prihlásia kódom do `/app`, vidia všetky projekty, zakladajú nové a jedným klikom sa dostanú do ich nastavení. Bez nastavenia sa projekty zakladajú CLI príkazom ako doteraz.
- **Prihlásenie e-mailom na boarde:** Nastavenia → Projekt → „Prihlásenie e-mailom“ (pre ľudí bez účtu v appke). Potrebuje `SMTP_URL`.
- **Písma (GDPR):** prehliadače návštevníkov nikdy nesťahujú písma z Google. Ozvi si písmo témy (Google Fonts) stiahne raz na serveri a ďalej ho servíruje sám z `/fonts/css` a `/fonts/file/…` (dlhá cache, `immutable`); vlastné písma Ozvi (Geist, Geist Mono) sú priamo v image. Povolené sú len rodiny z katalógu (`FONT_CATALOGUE` v `@ozvi/theme`) a rodiny uložené v téme niektorého projektu — nie je to otvorená proxy.
  - Cache je na disku v `OZVI_FONTS_DIR` (predvolene `fonts` vedľa priečinka s prílohami, v Dockeri `/data/fonts`, teda na tom istom volume) a v pamäti.
  - Server potrebuje odchádzajúci HTTPS na `fonts.googleapis.com` a `fonts.gstatic.com` len pri prvom použití písma. Ak Google nie je dostupný, stránka sa nerozbije — použije sa systémové písmo z témy.
  - `OZVI_FONTS_PREFETCH=1` stiahne pri štarte celý katalóg na pozadí (~10 MB). Potom môžete nastaviť `OZVI_FONTS_REMOTE=0`: Ozvi sa na Google nepripojí vôbec a servíruje len to, čo je na disku (inak systémové písmo). Pre úplne offline inštaláciu stačí raz spustiť s prefetchom a priečinok `fonts` zachovať.
  - Typ zdroja „Vlastné“ v téme znamená, že písmo načítava vaša appka sama; Ozvi ho nesťahuje.
- **GDPR a zásady ochrany súkromia:** pri vlastnej inštalácii ste prevádzkovateľ vy a s autormi Ozvi DPA nepotrebujete. Zmluvy uzatvárate s hostingom, e-mailovou službou, poskytovateľom AI a integráciami. Hotové texty do zásad podľa vašej konfigurácie nájdete v Nastaveniach → Dáta projektu → Texty pre vaše zásady ochrany súkromia, checklist je v [PRIVACY-KIT](PRIVACY-KIT.md).
- **Vývojárske prihlásenie** (`/dev/login`, `/demo`) funguje len pri `pnpm dev` s `OZVI_DEV_LOGIN=1`; v produkčnom image ani v cloud režime sa zapnúť nedá.

## Aktualizácie

Ozvi vychádza vo verziách (semver) s poznámkami na [ozvi.io/releases](https://ozvi.io/releases). O tom, kedy sa zmení váš server, rozhodujete vy: ručne, tlačidlom v admine alebo automaticky v noci.

### Obrazy a prístup

- Obrazy sú verejné, bez prihlásenia: `ghcr.io/xzamiska/ozvi` (aplikácia) a `ghcr.io/xzamiska/ozvi-updater` (voliteľný updater), pre `amd64` aj `arm64`.
- Ak ich zrkadlíte do vlastného súkromného registra, nastavte pre updater `OZVI_REGISTRY`, `OZVI_REGISTRY_USER` a `OZVI_REGISTRY_TOKEN`.
- Značky: `1.4.2` (presná verzia, nikdy sa nemení), `1.4` (len opravy), `1` (opravy aj nové funkcie, nič zásadné), `latest` (všetko vrátane 2.0).
- Predvolená je `OZVI_IMAGE=ghcr.io/xzamiska/ozvi:1`. Zásadné zmeny prídu až so `:2` a vyžadujú, aby ste značku zmenili sami.

### Upozornenie na novú verziu

Nastavenia boardu ukazujú bežiacu verziu. Raz denne ju porovnajú s verejným zoznamom vydaní (`OZVI_RELEASES_URL`, predvolene `https://ozvi.io/releases.json`). Ide o obyčajný GET a o inštancii sa nič neposiela. Vypnete ho cez `OZVI_UPDATE_CHECK=0`.

### Ručná aktualizácia

1. Zálohujte databázu: `docker compose exec postgres pg_dump -U postgres -Fc ozvi > ozvi-$(date +%F).dump`.
2. Spustite `docker compose pull && docker compose up -d`.
3. Migrácie databázy prebehnú pri štarte. Ak zlyhajú, kontajner nenaštartuje.

### Updater (voliteľný)

Malý kontajner `ozvi-updater` vedľa Ozvi. V admine pribudne časť **Aktualizácie** s výberom režimu:

| Režim | Čo robí |
|---|---|
| Len upozorniť | Pošle e-mail o novej verzii (`OZVI_ADMIN_EMAILS`). Nič nemení. |
| Na pokyn (predvolený) | Tlačidlo „Aktualizovať na X.Y.Z“ v admine. |
| Automaticky | V nočnom okne (`OZVI_UPDATE_WINDOW`, predvolene 02:00–05:00 v `TZ`) nainštaluje opravy a menšie verzie. Novú hlavnú verziu ani vydanie označené ako zásadné nikdy nenainštaluje sám. Verziu, ktorá raz zlyhala, sám znova neskúša. |

Pri každej aktualizácii:
1. zálohuje databázu do `./backups` (`pg_dump`, uchová posledných 5); bez zálohy nič nemení,
2. stiahne nový obraz (`docker compose pull ozvi`) a spustí ho (`docker compose up -d ozvi`),
3. počká, kým `/api/health` odpovie a beží nová verzia (najviac 3 minúty),
4. ak nie, zastaví ju, obnoví databázu zo zálohy a spustí predchádzajúci obraz,
5. pošle e-mail o výsledku a zapíše ho do histórie v admine.

Zapnutie v `.env` (vzor je v `deploy/.env.example`):

```sh
COMPOSE_PROFILES=updater
OZVI_UPDATER_URL=http://updater:8787
OZVI_UPDATER_TOKEN=…            # openssl rand -hex 32
OZVI_ADMIN_EMAILS=vy@firma.sk   # komu chodia e-maily o aktualizáciách
```

potom `docker compose up -d`.

- **Bezpečnosť:** updater potrebuje Docker socket, čo je v praxi plná kontrola nad serverom. Preto beží len s profilom `updater`, nemá žiadny verejný port, príkazy prijíma len od Ozvi so zdieľaným tokenom a mení iba službu `ozvi` svojho compose projektu. Kto mu tento prístup nechce dať, ostane pri ručnej aktualizácii.
- **Nastavenie celé v `.env`:** updater spúšťa `docker compose` v priečinku projektu len s jeho `.env`, nie s premennými z vášho shellu. Všetko, čo compose potrebuje, preto musí byť v `.env`.
- **Ručný `docker compose up -d` po aktualizácii** môže Ozvi raz reštartovať (pár sekúnd), ak má server inú verziu Docker Compose ako updater. Obraz ani dáta sa nemenia.
- **Priečinok projektu:** updater ho vidí na tej istej ceste ako hostiteľ (`OZVI_DIR`, predvolene `$PWD` pri spustení compose). Ak spúšťate compose inak (systemd, Portainer), nastavte `OZVI_DIR` na absolútnu cestu.
- **Obnova, keď zlyhá aj návrat** (e-mail „Aktualizácia Ozvi zlyhala“):
  1. `docker compose stop ozvi`
  2. `docker compose exec postgres psql -U postgres -c 'DROP DATABASE ozvi WITH (FORCE)' -c 'CREATE DATABASE ozvi OWNER ozvi'`
  3. `docker compose exec -T postgres pg_restore -U postgres -d ozvi < backups/<súbor>.dump`
  4. V `.env` nastavte `OZVI_IMAGE` na predchádzajúcu presnú verziu (napr. `ghcr.io/xzamiska/ozvi:1.4.2`) a spustite `docker compose up -d`.

### Návrat na staršiu verziu

Nastavte predchádzajúcu presnú verziu v `OZVI_IMAGE` a obnovte zálohu spred aktualizácie (postup vyššie). Migrácie idú len dopredu, preto bez obnovy zálohy návrat nefunguje.
