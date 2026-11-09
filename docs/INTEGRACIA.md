# Integrácia do hostiteľskej appky (SSO token)

Používateľ je v Ozvi prihlásený automaticky z vašej appky. Bez OAuth, bez druhého účtu.

## 1. Backend: podpíšte token

```ts
import { signOzviToken } from "@ozvi/sdk"; // MIT, bez závislostí

const token = signOzviToken(
  {
    id: user.id,                 // stabilné id vo VAŠOM systéme
    email: user.email,
    name: user.name,
    role: user.isStaff ? "team" : "member", // "team" = triáž a interné poznámky
    traits: { company: org.name, companyId: org.id, plan: org.plan, mrr: org.mrrCents, currency: "EUR" },
  },
  process.env.OZVI_SSO_SECRET!,   // ≥ 32 znakov, rovnaký ako v projekte Ozvi
);
```

Token platí 10 minút — vyrábajte ho pri každom otvorení spätnej väzby, nie raz pri logine.

### Údaje o zákazníkovi (`traits`)

Voliteľné. Vidí ich **len tím** (nikdy verejnosť ani iní používatelia): v detaile nápadu „Kto to chce“ (firma, plán, MRR
a súčet „chce to 4 firmy · spolu 1 240 € MRR“), v zozname nápadov triedenie „Podľa MRR“ a filter podľa plánu, v MCP
(`get_item`, `top_requests` so `sort: "mrr"`) len pre tokeny so scope `triage`.

| Vlastnosť | Typ | Význam |
|---|---|---|
| `company` | string | Názov firmy zákazníka |
| `companyId` | string | Stabilné id firmy; ľudia s rovnakým sa rátajú ako jedna firma (inak podľa názvu) |
| `plan` | string | Plán vo vašej appke (`free`, `pro`…) |
| `mrr` | integer | Mesačný príjem od firmy **v centoch** (2900 = 29 €); firma sa ráta raz, s najvyšším MRR |
| `currency` | string | ISO 4217 kód pre `mrr`, predvolene `EUR` |

Chýbajúce vlastnosti nevadia (zobrazí sa „bez údajov“). Uložíme najviac 30 vlastností, skalárne hodnoty, texty do 200
znakov. Token bez `traits` ponechá uložené údaje; prázdny objekt `{}` ich zmaže. Údaje sú súčasťou GDPR exportu
(„Moje údaje“, export projektu) a zmažú sa so zmazaním používateľa.

## 2. Odkazy z appky

| Akcia | URL |
|---|---|
| Nápady | `https://feedback.billiwo.com/billiwo/sso?token=…&return=/billiwo/ideas` |
| Nahlásiť chybu s kontextom | `…/sso?token=…&return=/billiwo/new%3Fkind%3Dbug%26url%3D%2Finvoices%2F12%26v%3D2.15.0` |
| Moje hlásenia | `…/sso?token=…&return=/billiwo/bugs` |

`return` musí začínať `/<projekt>/`; čokoľvek iné sa presmeruje na nápady (ochrana proti open redirect).

## 3. Návrat z prihlásenia

Ak má projekt nastavené `login_url`, neprihlásený návštevník dostane odkaz „Prihlásiť sa“ na
`<login_url>?ozvi_return=/billiwo/ideas`. Vaša appka po prihlásení presmeruje na
`/billiwo/sso?token=…&return=<ozvi_return>`.

## 4. Widget v appke: JavaScript API, roadmapa a novinky

Podrobne (anglicky, pre vývojárov hostiteľskej appky): [`packages/widget/README.md`](../packages/widget/README.md). Ukážka
všetkého na `/demo` (len s `OZVI_DEV_LOGIN=1`).

- **`window.Ozvi`** ovláda widget z vlastných tlačidiel: `Ozvi.open("ideas" | "idea" | "bug" | "mine")`, `close`, `toggle`,
  `prefill({ title, body, kind })`, `identify(token)` / `logout()`, `setTraits`, `setLanguage`, udalosti
  `open`, `close`, `submit`, `submitted {number, url, pending}`, `error` (`Ozvi.on`, alebo DOM udalosti `ozvi:<názov>`).
  Volania pred načítaním `widget.js` zachytí krátky „stub“ snippet a vykonajú sa po načítaní.
- **Nápady priamo vo widgete**: top nápady s hľadaním, hlasovanie (režim dôležitosti aj rozpočet hlasov stráži server),
  nový nápad s podobnými nápadmi počas písania a oznámením o čakaní na schválenie. Hlasovanie neprihlasuje na e-maily.
- **Vložené prvky** `<ozvi-roadmap project="…">` a `<ozvi-changelog project="…" mode="badge">` (posledné záznamy,
  odznak „Novinky“ s počtom neprečítaných, uložený len v `localStorage` prehliadača). Verejné boardy ich dovolia
  vložiť na akýkoľvek web (len na čítanie); boardy so súkromnými nápadmi len s tokenom z povolených originov.
- **npm**: `@ozvi/widget` (ESM), `@ozvi/widget/react` (`OzviWidget`, `OzviRoadmap`, `OzviChangelog`, `useOzvi`,
  `useOzviEvent`), `@ozvi/widget/vue` (plugin, komponenty, composables), s typmi. Bezpečné pre SSR / Next.js.
- **Prísna CSP s nonce**: nonce zo `<script>` widgetu prejde na všetky skripty a štýly, ktoré widget pridá (aj na
  screenshot). Potrebné direktívy sú v README.
- Rozpočet: úvodný `widget.js` ≤ 20 kB gzip (test `packages/widget/src/size.test.ts`); nápady a vložené prvky sa
  načítajú až pri použití.

API pre widget (CORS: povolené originy projektu môžu poslať `Authorization: Bearer <SSO token>`, ostatné čítajú len
verejné údaje): `GET /<projekt>/api/widget/ideas?q=&limit=`, `POST /<projekt>/api/widget/vote` `{id, weight}`,
`GET /<projekt>/api/widget/roadmap?limit=`, `GET /<projekt>/api/widget/changelog?limit=`.

## Bezpečnosť

- Secret sa v Ozvi ukladá šifrovane (AES-256-GCM, `OZVI_SECRET_KEY`).
- Používatelia sú per projekt a kľúčovaní podľa `id`, nikdy len podľa e-mailu.
- Session cookie je `httpOnly`, `SameSite=Lax` a obmedzená na cestu `/<projekt>`.

## Roly

- `role` v tokene (`member`/`team`/`admin`) je zdroj pravdy: pri každom prihlásení prepíše rolu v Ozvi. Keď niekto rolu stratí, jeho ostatné prihlásenia v Ozvi sa okamžite zrušia.
- Bez `role` v tokene rolu spravuje admin v Ozvi (Nastavenia → Ľudia). Tam je aj „Odhlásiť všade“ — zruší session aj API tokeny daného človeka hneď.

## Alternatíva: OIDC

Ak appka (alebo firma) má poskytovateľa identity (Keycloak, Authentik, Zitadel, Auth0, Google…), nastavte ho v Nastavenia → Prihlásenie cez OIDC.
Redirect URI: `https://<ozvi>/<projekt>/oidc/callback`. `sub` sa stane id používateľa — ak ste predtým používali Fider s tým istým poskytovateľom, importovaní ľudia si zachovajú históriu. Roly od poskytovateľa nepreberáme (pri niektorých si ich používateľ vie upraviť sám) — nastavíte ich v Ozvi → Ľudia. Pozor: zmena issuera neskôr spáruje účty podľa `sub` nového poskytovateľa.

## GitHub

Nastavenia → GitHub: repozitár `vlastník/názov` + fine-grained token (len ten repozitár, **Issues: Read and write**). Potom v repozitári Settings → Webhooks:
URL `https://<ozvi>/<projekt>/api/github`, `application/json`, secret z Ozvi, udalosti **Issues**, **Pull requests** a **Releases**.

- Na detaile hlásenia: „Prepojiť“ existujúce issue (`#12`, `vlastník/repo#12` alebo odkaz) alebo „Vytvoriť issue“. Na GitHub ide len názov, popis a verzia appky.
- Issue zatvorené ako *completed* → po najbližšom **publikovanom release** dostane chyba stav „Opravené vo verzii `<tag>`“ a reportér e-mail s tlačidlom „Potvrdiť opravu“; prepojené nápady prejdú na „Vydané“ (autor a komentujúci dostanú bežný e-mail, hlasujúci až zo zverejnenej novinky). Projekty bez releasov si zvolia „Hneď označiť ako opravené“.
- **Návrh novinky z release:** release, ktorý niečo opravil alebo vydal, založí koncept novinky (nadpis z tagu, zoznam nápadov s odkazmi, opravy chýb len počtom, lebo hlásenia sú súkromné). S AI (plán s AI, self-host s nastaveným `OZVI_AI_PROVIDER`) text po odpovedi GitHubu prepíše model AI, ak ho medzitým nikto neupravil. **Nikdy sa nezverejní sám**: tím dostane e-mail „Návrh novinky pre vX čaká na schválenie“ a koncept vidí v Novinkách. Až zverejnenie pošle hlasujúcim jeden e-mail. Opakované doručenie toho istého release nič nezdvojí.
- **Dôkaz opravy:** zlúčené PR sa pripoja k položkám, ktoré menuje riadok `Ozvi: #12, #13`, alebo ktorých prepojené issue zatvára (`Fixes #40`, `closes vlastník/repo#41`). Riadok `Ozvi-Preview: https://…` pridá odkaz na náhľad. Tím môže PR alebo náhľad pridať aj ručne (detail → Dôkaz opravy), MCP cez `set_status` (`pullRequests`, `previewUrl`). Pri prechode na „Opravené“/„Vydané“ sa dôkaz (PR s názvom, release, náhľad) uloží k zastávke na trase a príde reportérovi v e-maile „funguje vám to?“. Pri verejných nápadoch vidia PR len tím (repo môže byť súkromné), ostatní náhľad a release.
- **Vydané, ale neoznámené:** Novinky (len tím) a pondelkový prehľad ukazujú vydané nápady a opravené chyby, o ktorých ešte nehovorí žiadna zverejnená novinka.

## Linear

Nastavenia → Integrácie → Linear. Prepojenie cez **osobný API kľúč** (Linear → Settings → Security & access → Personal API keys), uložený šifrovane ako ostatné tajomstvá. OAuth aplikácia Linearu by vyžadovala registrovanú appku a verejnú callback adresu pre každú inštanciu (self-host), preto zatiaľ kľúč; ideálne kľúč servisného účtu.

1. Vložte kľúč → „Prepojiť Linear“ → vyberte **tím** → uložte. Kľúč admina workspace vytvorí webhook v Lineari sám (`webhookCreate`, udalosti *Issues*, náš podpisový secret); inak sa zobrazí adresa `https://<ozvi>/<projekt>/api/linear` a postup na ručné pridanie, podpisový secret z Linearu vložíte do Ozvi. Lokálne (`localhost`) vás Linear nezavolá: smer Ozvi → Linear funguje, Linear → Ozvi až na verejnej adrese.
2. **Mapovanie stavov:** každý stav workflow tímu → zastávka Ozvi. Predvolené: Backlog/Todo → Plánované (nápad) / Potvrdené (chyba), In Progress → Rozpracované, Done → Vydané / Opravené, Canceled/Duplicate → Zamietnuté / Nebude sa riešiť, Triage → ignorovať. Opačným smerom sa použije prvý stav v poradí workflow namapovaný na zastávku.
3. **Možnosti:** „Presunúť issue, keď sa zmení zastávka v Ozvi“ (obojsmerne, predvolene zapnuté) a zrkadlenie komentárov z Ozvi do Linearu: vypnuté / verejné / verejné aj interné poznámky (len pre tracker, ktorý zákazníci nevidia). Komentáre z Linearu do Ozvi nejdú.
4. „Otestovať spojenie“ overí kľúč a znova načíta stavy (mapovanie existujúcich stavov ostane). „Odpojiť“ zmaže aj webhook, ktorý sme vytvorili; prepojenia pri položkách ostanú.

Na detaile položky (tím): „Prepojiť“ existujúce issue (`ENG-123` alebo odkaz z Linearu, len z prepojeného tímu) alebo „Vytvoriť v Linear“. Issue dostane názov a popis **vyčistený ako pri GitHube** (hlavička s pôvodom: úroveň dôvery a zdroj, nikdy meno; citácia bez skrytého obsahu, `@zmienky` neaktívne), odkaz na položku a verziu appky, nikdy konzolu ani screenshoty.

**Linear → Ozvi:** webhook podpísaný hlavičkou `Linear-Signature` (hex HMAC-SHA256 tela) a `webhookTimestamp` najviac minútu starý (ochrana proti opakovaniu). Zmena stavu presunie položku cez bežný `changeStatus`: autor a komentujúci dostanú obvyklý e-mail, **hlasujúcim nič** (dozvedia sa zo zverejnenej novinky), do vlákna pribudne interná poznámka „Linear ENG-12 sa presunulo do stavu …“. Pri prechode do stavu namapovaného na Vydané/Opravené sa pull requesty pripojené k issue (GitHub, GitLab – pridáva ich integrácia Linearu) uložia ako **dôkaz opravy**.

**Žiadny ping-pong:** (1) zmena, ktorá prišla z trackera, beží v kontexte tohto prepojenia a fronta ju naspäť neposiela; (2) prepojenie si pamätá posledný videný stav (`item_links.sync.stateId`), opakovaný webhook s rovnakým stavom nič nerobí; (3) aj to, čo Ozvi poslalo (`pushedStateId`, 15 min) – ozvena nášho presunu sa ignoruje, a fronta nič nepošle, ak issue už v cieľovej zastávke je.

## Jira Cloud

Nastavenia → Integrácie → Jira Cloud: adresa (`firma.atlassian.net`; prijmeme **len** `https://<názov>.atlassian.net`, nič iné sa nevolá – ochrana proti SSRF), e-mail účtu Atlassian a **API token** (id.atlassian.com → Security → API tokens; ideálne servisný účet s prístupom k jednému projektu, oprávnenia prehliadať, vytvárať, presúvať a komentovať). Potom projekt a typ issue pre nové issues. Mapovanie, zrkadlenie komentárov, test a odpojenie ako pri Lineari; predvolené mapovanie podľa kategórie stavu (To Do → Plánované/Potvrdené, In Progress → Rozpracované, Done → Vydané/Opravené, stavy s názvom ako *Won't Do*, *Cancelled*, *Rejected*, *Duplicate* → Zamietnuté/Nebude sa riešiť).

- Issue sa vytvára s popisom v ADF (Atlassian Document Format): text od používateľov je doslovný text, nemôže z neho vzniknúť odkaz ani formátovanie; skryté znaky a HTML komentáre sú preč. Štítok `ozvi`.
- Ozvi → Jira: Jira nemá „nastav stav“, použije sa prechod workflow, ktorý vedie do cieľového stavu. Ak z aktuálneho stavu taký prechod nie je, pokus sa zopakuje a potom vzdá (vidno v `tracker_syncs.last_error`).
- **Jira → Ozvi, dve možnosti:**
  - **Webhook** (okamžite): administrátor Jiry v Settings → System → WebHooks vytvorí webhook s adresou `https://<ozvi>/<projekt>/api/jira`, poľom *Secret* zo zobrazenia pri prepojení (hlavička `X-Hub-Signature: sha256=<hex>`), JQL `project = KĽÚČ`, udalosti *Issue updated* a *Issue deleted*. Systémové webhooky vyžadujú práva administrátora Jiry (dynamické webhooky cez REST sú len pre Connect/OAuth aplikácie). Stratený secret: „Vygenerovať nový secret“.
  - **Kontrola každých 5 minút** (bez admin práv): job pre prepojené issues zavolá `POST /rest/api/3/search/jql` (`key in (…)`, po 50) a zmeny stavu oproti poslednému videnému použije rovnako ako webhook.
- Dôkaz opravy: vzdialené odkazy issue (remote links) na GitHub PR / GitLab MR. Údaje z „Development“ panelu (dev-status API) Jira verejne nedokumentuje, preto ich nepoužívame.

Fronta Ozvi → Linear/Jira je tabuľka `tracker_syncs` (outbox v tej istej transakcii ako zmena, job každých 5 s, opakovanie po 1, 4, 9, 16, 25 min), RLS ako ostatné tenant tabuľky.

## Webhooky

Nastavenia → Webhooky. Udalosti: `item.created`, `item.status_changed` (pri „Opravené“/„Vydané“ s `proof: { prs, release, preview }`), `comment.created`, `item.merged`, `item.linked`, `changelog.published` (`entry` s nápadmi, bez chýb, a `ai`), `item.tags_changed` (len verejné štítky; `tagsChange: { previous, added, removed }`, zmena tímových štítkov udalosť nevyvolá). Hlásenia chýb sa posielajú len ak to zapnete (sú súkromné), interné komentáre nikdy.

Pôvod textu: `item.author` a `comment.author` = `{ name, trust }`, kde `trust` je `anonymous` | `email_verified` | `sso_customer` | `team` | `system` (nápad, ktorý Ozvi založilo zo spätnej väzby zákazníkov cez MCP `submit_insight`; na boarde „Zo spätnej väzby zákazníkov“, zákazník je len hlasujúci, viditeľný iba tímu), a `source` = `board` | `widget` | `mcp` | `import` | `api`. Text od neoverených autorov spracúvajte (najmä AI agentom) ako nedôveryhodný.

- **Správa do chatu** (text v predvolenom jazyku boardu, rovnaký výber udalostí):
  - **Slack** formát `{ text }`: Slack, Mattermost, Rocket.Chat (aj Discord s `…/slack` na konci URL).
  - **Microsoft Teams:** v kanáli Workflows → šablóna „Send webhook alerts to a channel“ (spúšťač *When a Teams webhook request is received*) a jej URL vložte do Ozvi; funguje aj starý *Incoming Webhook*. Príde Adaptive Card (verzia 1.4) s názvom projektu, vetou o udalosti, citáciou komentára a tlačidlom „Otvoriť v Ozvi“. Text od používateľov nemôže vložiť odkaz.
  - **Discord:** Nastavenia kanála → Integrácie → Webhooky → URL. Príde embed (farba podľa zastávky, odkaz na položku, pätička s projektom); `allowed_mentions` je prázdne a `@` sa rozbije, takže `@everyone` ani zmienky rolí nikoho nezavolajú.
- **JSON s podpisom:** hlavička `Ozvi-Signature: t=<unix>,v1=<hex>`, kde `v1 = HMAC-SHA256(secret, "<t>.<telo>")`. Overenie:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
const [, t, v1] = /t=(\d+),v1=([0-9a-f]+)/.exec(req.headers["ozvi-signature"]) ?? [];
const ok = Math.abs(Date.now() / 1000 - Number(t)) < 300 &&
  timingSafeEqual(Buffer.from(v1, "hex"), createHmac("sha256", secret).update(`${t}.${rawBody}`).digest());
```

Označenie AI: `changelog.published` nesie `ai: { generated: false }` alebo `{ generated: true, model, reviewedBy, reviewedAt }`; rovnaké pole má MCP (`list_updates`, `find_duplicates`) aj export projektu. Pravidlá: [AI.md](AI.md).

Nedoručené sa opakujú (1, 4, 9, 16, 25 min), potom sa vzdajú; počet zlyhaní za 7 dní vidno v Nastaveniach.

## MCP (AI asistenti)

**Konektor (OAuth, bez tokenu):** v Claude.ai / ChatGPT pridajte vlastný konektor s adresou `https://<ozvi>/<projekt>/mcp`. Aplikácia sa predstaví vlastným popisom (Client ID Metadata Document; staršie klienty sa ešte registrujú cez DCR) a na obrazovke súhlasu uvidíte jej overenú doménu, používateľ sa prihlási do boardu (SSO z appky, OIDC alebo e-mailom) a zvolí oprávnenie. Prístup platí hodinu a obnovuje sa; zrušíte ho v Moje API tokeny.


**Osobný token (headless agenti, CI; v self-hoste aj v cloude):** Avatar → Moje API tokeny → token (čítať / písať / triáž) → `claude mcp add --transport http ozvi https://<ozvi>/<projekt>/mcp --header "Authorization: Bearer ozvi_pat_…"`. Adresa `/<projekt>/mcp` funguje aj na vlastnej doméne a cloudovej subdoméne boardu; `/mcp` len na hlavnej adrese inštancie.

**Uzamknutý režim:** Nastavenia → Integrácie → API tokeny a MCP → „Uzamknutý režim“, alebo pre jedno pripojenie hlavička `X-Ozvi-Lockdown: 1` (overení autori) / `team` (len tím). Príspevky pod úrovňou prídu bez názvu a textu (`withheld: true`).

**Export do GitHubu:** issue vytvorené z príspevku nesie hlavičku s pôvodom (úroveň dôvery, zdroj, nikdy meno), text je v citácii a zbavený skrytého obsahu (HTML komentáre a HTML, neviditeľné a bidi znaky, Unicode tagy, definície odkazov); `@zmienky` sú neaktívne. Chráni coding agentov, ktorí issue čítajú (útoky typu GitLost).
Nástroje a pravidlá: [`packages/mcp/README.md`](../packages/mcp/README.md).
