# Privacy kit: texty pre zásady ochrany súkromia

> Toto nie je právna rada. Texty aj tento návod pred použitím skontrolujte s právnikom.

Firmy, ktoré Ozvi vložia do svojej appky (napríklad Billiwo), musia svojim používateľom povedať, čo sa s ich údajmi deje, a zapísať spracúvanie do záznamov o spracovateľských činnostiach (čl. 30 GDPR). Privacy kit im k tomu dá hotové odseky.

## Kde ho nájdete

Nastavenia projektu → **Dáta projektu** → **Texty pre vaše zásady ochrany súkromia** (`/<projekt>/admin#privacy-kit`, len admin).

- Jazyk textu: ktorýkoľvek z 6 jazykov boardu (sk, cs, en, pl, hu, de), nezávisle od jazyka rozhrania.
- Sekcie: účel a právny základ (návrh na kontrolu), kategórie údajov, príjemcovia a sprostredkovatelia, uchovávanie, práva dotknutých osôb, tabuľka cookies a úložiska prehliadača.
- Kopírovanie po sekciách alebo všetko naraz ako Markdown alebo HTML.
- Údaje v hranatých zátvorkách (`[kontaktný e-mail]`, `[poskytovateľ hostingu, krajina]` …) treba doplniť ručne. Kit ich nehádže.

Text sa skladá zo **skutočného nastavenia projektu a inštancie**:

| Čo | Odkiaľ |
|---|---|
| Režim cloud / self-host | `OZVI_MODE` |
| Prihlásenie (SSO z appky, kód e-mailom, OIDC) | nastavenia projektu → Prihlásenie |
| Čo posiela widget (snímka, konzola, záznam požiadaviek, kroky, odkazy na reláciu) | predvolené hodnoty widgetu; admin odškrtne, čo vo svojej appke vypol (`OzviConfig`, atribúty `network`, `actions`, `links`) |
| AI funkcie a ich poskytovateľ | plán (cloud) / `OZVI_AI_PROVIDER`, `OZVI_AI_BASE_URL` (self-host); preklad podľa Jazyky → Preklad príspevkov |
| Integrácie | pripojený GitHub, Linear, Jira, aktívne webhooky (Slack, Teams, Discord, JSON) |
| E-maily | cloud: Resend cez Ozvi; self-host: host z `SMTP_URL` alebo Ecomail |
| Prílohy, embeddingy (self-host) | `S3_ENDPOINT`, `OZVI_EMBEDDINGS_URL` (lokálny server sa neuvádza) |
| Uchovávanie | Dáta projektu → Uchovávanie dát |
| Cookies a úložisko | `lib/storage-keys.ts`, `cookieName`, `flowCookieName`, `LOCALE_COOKIE`; test `privacy-kit.test.ts` prehľadá kód widgetu aj boardu a zlyhá, keď pribudne nový kľúč, ktorý tabuľka nepozná |

## Kto je kto

### Ozvi cloud

- **Zákazník** (firma s boardom) je **prevádzkovateľ** údajov svojich používateľov.
- **Ozvi** je **sprostredkovateľ** (čl. 28 GDPR). Potrebná je zmluva o spracúvaní (DPA). Vzor je v [`DPA.md`](DPA.md) a zatiaľ je to návrh na právnu kontrolu. Zákazník si ho vyžiada e-mailom na support@ozvi.io (konzola → Plán a využitie → karta DPA).
- Ďalší sprostredkovatelia Ozvi sú zverejnení na `/subprocessors`. Kit v cloude odkazuje na tento zoznam a menovite uvádza Resend a pri zapnutej AI aj Anthropic.
- Integrácie (GitHub, Linear, Jira, webhooky) si zapína zákazník cez vlastné účty, takže údaje idú tam v jeho mene. Kit ich vypíše ako nástroje zákazníka.

### Self-host

- **Prevádzkovateľ inštalácie** (napríklad Billiwo, ktoré si Ozvi spustí samo) je prevádzkovateľ. S autormi Ozvi **žiadnu DPA neuzatvára**, lebo k údajom nemajú prístup a inštancia im nič neposiela. Kontrola aktualizácií je len GET bez údajov o inštancii a dá sa vypnúť cez `OZVI_UPDATE_CHECK=0`.
- Jeho sprostredkovateľmi sú poskytovatelia, ktorých si sám zvolí. Kit ich vypíše podľa konfigurácie (hosting ako `[doplniť]`, e-mail podľa `SMTP_URL`, AI podľa nastaveného poskytovateľa, S3, embeddingy, integrácie).

## Checklist pre self-host

- [ ] **Hosting:** zmluva o spracúvaní s poskytovateľom servera (Hetzner, OVH, AWS …) a záznam o mieste dát. Rovnako s poskytovateľom záloh, ak sú inde.
- [ ] **E-maily:** DPA so službou v `SMTP_URL` (Resend, Postmark, Amazon SES, Brevo …) alebo s Ecomailom. Overte, kde e-maily spracúva a na akom základe prenáša dáta mimo EÚ.
- [ ] **AI** (len ak je zapnutá cez `OZVI_AI_PROVIDER`): pri Anthropic alebo inom cloudovom API DPA a podmienky poskytovateľa (bez trénovania na vašich dátach) a mechanizmus prenosu. Lokálny model (Ollama, vLLM na vlastnom serveri) nie je tretia strana.
- [ ] **Embeddingy** (`OZVI_EMBEDDINGS_URL`): ak ide o externé API, platí to isté ako pri AI.
- [ ] **Prílohy v S3** (`S3_*`): DPA s poskytovateľom úložiska.
- [ ] **Integrácie:** GitHub, Linear, Jira, Slack, Microsoft Teams, Discord, prípadne vlastné webhooky. Zmluvy máte s nimi priamo, Ozvi im posiela údaje vo vašom mene. Webhook „vrátane hlásení chýb“ posiela aj súkromné hlásenia.
- [ ] **Uchovávanie:** nastavte Dáta projektu → Uchovávanie dát a hodnoty prepíšte do zásad. Kit ich preberá automaticky.
- [ ] **Widget:** citlivé polia označte `data-ozvi-mask`. Čo nechcete posielať, vypnite (`OzviConfig.network = false`, `actions = false`) a v kite to odškrtnite.
- [ ] **Práva dotknutých osôb:** export a vymazanie údajov má každý používateľ sám na boarde v časti „Moje údaje“ (`/<projekt>/me`). Do zásad doplňte kontakt pre ostatné žiadosti.
- [ ] **Záznam o spracovateľských činnostiach** (čl. 30): sekcie „Aké údaje spracúvame“, „Kto údaje spracúva“ a „Ako dlho údaje uchovávame“ slúžia ako podklad.

## Pre vývojárov

- Generátor: `apps/web/src/lib/privacy-kit.ts` (čistý, beží aj v prehliadači). Fakty o projekte a inštancii: `privacy-kit-config.ts` (server, nikdy nečíta tajomstvá, len hosty). Texty: `messages/*.json` → `privacyKit`.
- Nový cookie alebo kľúč v `localStorage` pridajte do `lib/storage-keys.ts` a do `browserStorage()`, inak test zlyhá.
- Nový sprostredkovateľ v cloude: upravte `/subprocessors` (`subprocessors.items`), `DPA.md` a texty v `privacyKit.recipients`.
