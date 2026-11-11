import type { PageContent } from "../types";

/*
 * Fider facts (research of November 2026, "Analýza trhu feedback nástrojov", section on open-source
 * boards and on sign-in): AGPL-3.0, active (v0.39.0 of 2026-11-03), one Go binary and PostgreSQL,
 * hosted Free (250 items) / Pro $25 a month, no widget (request since 2018, 46 votes), iframe embedding
 * blocked since v0.38.2, no signed-token SSO (the host app must be an OAuth/OIDC provider), wildcard
 * DNS and certificate for multi-tenant, Pro features switched on in SQL there, most-wanted requests
 * (vote limits 155, internal notes 88, custom statuses 44), security fixes incl. the cross-tenant
 * takeover in v0.37.0, webhooks switched off after one failure, e-mail login with a 6-digit code,
 * reported GDPR issues (voter e-mails, Google Fonts). Import: docs/MIGRACIA-Z-FIDERU.md.
 */

const sources = [
  { label: "Fider – GitHub", href: "https://github.com/getfider/fider" },
  { label: "Fider – pricing", href: "https://fider.io/pricing" },
  { label: "Fider – releases", href: "https://github.com/getfider/fider/releases" },
  { label: "Fider – most wanted (feedback.fider.io)", href: "https://feedback.fider.io/api/v1/posts?view=most-wanted" },
  { label: "Fider – website widget request (#97)", href: "https://feedback.fider.io/posts/97" },
  { label: "Fider – Sign in user automatically (#1123)", href: "https://github.com/getfider/fider/issues/1123" },
  { label: "Fider docs – Multi-Tenant", href: "https://docs.fider.io/multi-tenant" },
  { label: "Fider – webhooks disabled after a failure (#1404)", href: "https://github.com/getfider/fider/issues/1404" },
];

export const fider: PageContent = {
  sk: (f) => ({
    meta: {
      title: "Alternatíva k Fideru: widget, hlásenia chýb a SSO – Ozvi",
      description: "Ozvi nahrádza Fider tam, kde nestačí: widget v aplikácii, súkromné hlásenia chýb, prihlásenie z vašej appky. Import z Fideru prenesie hlasy, komentáre aj čísla.",
    },
    them: "Fider",
    h1: "Alternatíva k Fideru",
    answer: [
      "Fider je jednoduchý a stabilný board na nápady: jeden binárny súbor, PostgreSQL a licencia AGPL. Nemá však widget do aplikácie, používateľov z vašej appky neprihlási podpísaným tokenom a hlásenia chýb rieši rovnako ako nápady, verejne.",
      `Ozvi vznikol ako náhrada Fideru pre naše prvé aplikácie. Pridáva widget so screenshotom a chybami z konzoly, súkromné hlásenia chýb, prihlásenie cez vašu aplikáciu a obmedzenie hlasov. Import z Fideru prenesie nápady, hlasy, komentáre, štítky, prílohy aj čísla príspevkov. Ak vám stačí verejný board a chcete licenciu AGPL, Fider je dobrá voľba.`,
    ],
    table: {
      caption: "Porovnanie Ozvi a Fideru podľa funkcií",
      rows: [
        { label: "Widget do aplikácie", ozvi: { text: "Jeden skript, menej ako 20 kB gzip, shadow DOM; aj ako React komponent", mark: "yes" }, them: { text: "Nie; požiadavka je otvorená od roku 2018 a od v0.38.2 sa Fider nedá vložiť ani do iframe", mark: "no" } },
        { label: "Súkromné hlásenia chýb so screenshotom a chybami z konzoly", ozvi: { text: "Áno; hlásenie vidí len autor a tím, autor dostane e-mail, keď je opravené", mark: "yes" }, them: { text: "Nie; chyby sú bežné verejné príspevky", mark: "no" } },
        { label: "Prihlásenie z vašej aplikácie", ozvi: { text: "Podpísaný token (HS256) alebo OIDC; používateľ sa prihlási sám", mark: "yes" }, them: { text: "Len ak sa vaša appka stane OAuth/OIDC poskytovateľom; automatické prihlásenie chýba", mark: "partial" } },
        { label: "Obmedzenie počtu hlasov", ozvi: { text: "Áno, aj hlasovanie podľa dôležitosti", mark: "yes" }, them: { text: "Nie; najžiadanejšia funkcia na ich boarde (155 hlasov od roku 2017)", mark: "no" } },
        { label: "Interné poznámky tímu", ozvi: { text: "Áno, aj štítky len pre tím", mark: "yes" }, them: { text: "Nie; 88 hlasov na ich boarde", mark: "no" } },
        { label: "Vlastné stavy", ozvi: { text: "Premenovanie stavov a podstavy pod každým z nich", mark: "yes" }, them: { text: "Nie; 44 hlasov na ich boarde", mark: "no" } },
        { label: "Viac produktov v jednej inštalácii", ozvi: { text: "Projekty na ceste alebo vlastnej doméne, bez wildcard certifikátu", mark: "yes" }, them: { text: "Multi-tenant režim s wildcard DNS a wildcard certifikátom; Pro funkcie sa tam zapínajú v databáze", mark: "partial" } },
        { label: "Webhooky", ozvi: { text: "Podpísané, s opakovaním a logom doručení", mark: "yes" }, them: { text: "Po jednom zlyhaní sa vypnú a ostanú vypnuté", mark: "partial" } },
        { label: "Ochrana súkromia", ozvi: { text: "Písma z vlastného servera, nie z Google Fonts; export a zmazanie dát používateľa", mark: "yes" }, them: { text: "Nahlásené problémy: viditeľné e-maily hlasujúcich, písma z Google Fonts", mark: "partial" } },
        { label: "Licencia", ozvi: { text: "Verejný zdrojový kód (FSL), po dvoch rokoch Apache 2.0; SDK a widget MIT" }, them: { text: "AGPL-3.0" } },
        { label: "Prevádzka na vlastnom serveri", ozvi: { text: "Jeden Docker image a Postgres, všetky funkcie za 0 €", mark: "yes" }, them: { text: "Jeden Go binárny súbor a PostgreSQL, veľmi jednoduché", mark: "yes" } },
        { label: "Hostovaná verzia", ozvi: { text: `Free 0 €, Pro ${f.pro} ročne alebo ${f.proQuarter} štvrťročne, bez limitu záznamov` }, them: { text: "Free do 250 položiek, Pro $25 mesačne" } },
      ],
      note: "Počty hlasov sú z verejného boardu Fideru (feedback.fider.io).",
    },
    pickThem: {
      title: "Kedy ostať pri Fideri",
      items: [
        "Potrebujete licenciu AGPL schválenú OSI; Ozvi má verejný zdrojový kód pod licenciou FSL, ktorá sa na Apache 2.0 mení až po dvoch rokoch.",
        "Chcete čo najmenej pohyblivých častí: jeden Go binárny súbor a databázu.",
        "Stačí vám verejný board na nápady, widget ani súkromné hlásenia chýb nepotrebujete.",
        "Vaša appka už je OAuth/OIDC poskytovateľom, alebo vám prihlásenie kódom do e-mailu vyhovuje.",
      ],
    },
    pickOzvi: {
      title: "Kedy prejsť na Ozvi",
      items: [
        "Chcete, aby používatelia hlásili chyby priamo v aplikácii a tím dostal screenshot, verziu a chyby z konzoly.",
        "Používatelia sa majú na board dostať z vašej aplikácie bez ďalšieho prihlasovania.",
        "Chýbajú vám funkcie, na ktoré sa na boarde Fideru čaká roky: obmedzenie hlasov, interné poznámky, vlastné stavy.",
        "Chcete GitHub, Linear, Jira a MCP pre AI asistentov a webhooky, ktoré sa po výpadku nevypnú.",
      ],
    },
    migrate: {
      title: "Prechod z Fideru",
      text: "Import z Fideru je v Admin → Import. Najprv uvidíte náhľad, nič sa neuloží; potom import beží na pozadí. Nikomu nejde e-mail ani webhook, opakovaný import prenesie len to, čo vo Fideri medzitým pribudlo, a celý beh sa dá vrátiť späť.",
      steps: [
        "Vo Fideri stiahnite zálohu (Administrácia → Export → Záloha, do 25 MB), alebo si pripravte API kľúč administrátora.",
        "V Ozvi zvoľte Admin → Import → Fider a v náhľade vyberte štítok, ktorý označuje chyby, a prihlásenie z vašej appky.",
        "Príspevky so štítkom chýb sa stanú súkromnými hláseniami, ostatné nápadmi; čísla ostanú, ak sú voľné. Prenesú sa hlasy, komentáre, štítky, stavy, prílohy a duplicity sa zlúčia.",
        "Používatelia s identitou z vašej appky sa pri prvom prihlásení cez SSO spárujú so svojimi hlasmi.",
      ],
    },
    faq: [
      { q: "Prenesie import z Fideru hlasy a komentáre?", a: "Áno. Prenesú sa nápady, hlasy, komentáre, štítky s rovnakou viditeľnosťou, stavy, odpovede tímu aj prílohy uložené vo Fideri. Duplicity sa zlúčia do originálu a čísla príspevkov ostanú, ak sú na boarde voľné." },
      { q: "Musia sa používatelia po prechode znova registrovať?", a: "Nie. Ak sa do Fideru prihlasovali cez vašu appku, Ozvi si ich zapamätá podľa id v appke a prvé prihlásenie cez SSO trafí toho istého človeka aj s jeho hlasmi. Ostatných spáruje podľa e-mailu." },
      { q: "Môžem migráciu skúsiť a vrátiť späť?", a: "Áno. Náhľad nič neuloží, počas importu nikomu nejde e-mail ani webhook a celý import sa dá v Admin → Import vrátiť späť aj so súbormi. Opakovaný import prenesie len nové príspevky." },
      { q: "Akú licenciu má Ozvi v porovnaní s Fiderom?", a: "Ozvi má verejný zdrojový kód pod licenciou FSL, ktorá sa po dvoch rokoch mení na Apache 2.0. Na vlastnom serveri máte všetky funkcie zadarmo, ale hostovať Ozvi ako konkurenčnú službu licencia nedovoľuje. SDK a widget sú pod MIT. Fider má licenciu AGPL-3.0." },
      { q: "Koľko stojí Ozvi v porovnaní s hostovaným Fiderom?", a: `Hostovaný Fider Pro stojí $25 mesačne. Ozvi Pro stojí ${f.pro} ročne alebo ${f.proQuarter} štvrťročne (bez DPH), Free je bez karty a na vlastnom serveri platíte 0 €.` },
    ],
    sources,
  }),
  en: (f) => ({
    meta: {
      title: "Fider alternative with a widget, bug reports and SSO – Ozvi",
      description: "Ozvi picks up where Fider stops: an in-app widget, private bug reports and sign-in from your app. The Fider import keeps votes, comments and post numbers.",
    },
    them: "Fider",
    h1: "A Fider alternative",
    answer: [
      "Fider is a simple, stable ideas board: one binary, PostgreSQL and an AGPL licence. It has no widget for your app, cannot sign your users in with a signed token, and treats bug reports like ideas, in public.",
      "Ozvi was built to replace Fider in our own first apps. It adds a widget with a screenshot and console errors, private bug reports, sign-in through your app and vote limits. The Fider import brings ideas, votes, comments, tags, attachments and post numbers. If a public board is all you need and you want an AGPL licence, Fider is a good choice.",
    ],
    table: {
      caption: "Ozvi and Fider compared by feature",
      rows: [
        { label: "Widget for your app", ozvi: { text: "One script, under 20 kB gzip, shadow DOM; also as a React component", mark: "yes" }, them: { text: "No; the request has been open since 2018, and since v0.38.2 Fider cannot be embedded in an iframe either", mark: "no" } },
        { label: "Private bug reports with screenshot and console errors", ozvi: { text: "Yes; only the reporter and the team see them, and the reporter is e-mailed when it is fixed", mark: "yes" }, them: { text: "No; bugs are ordinary public posts", mark: "no" } },
        { label: "Sign-in from your app", ozvi: { text: "Signed token (HS256) or OIDC; users are signed in automatically", mark: "yes" }, them: { text: "Only if your app becomes an OAuth/OIDC provider; automatic sign-in is missing", mark: "partial" } },
        { label: "Vote limits", ozvi: { text: "Yes, plus voting by importance", mark: "yes" }, them: { text: "No; the most wanted request on its board (155 votes since 2017)", mark: "no" } },
        { label: "Internal team notes", ozvi: { text: "Yes, plus team-only tags", mark: "yes" }, them: { text: "No; 88 votes on its board", mark: "no" } },
        { label: "Custom statuses", ozvi: { text: "Rename statuses and add sub-statuses under each", mark: "yes" }, them: { text: "No; 44 votes on its board", mark: "no" } },
        { label: "Several products in one install", ozvi: { text: "Projects on a path or their own domain, no wildcard certificate", mark: "yes" }, them: { text: "Multi-tenant mode with wildcard DNS and a wildcard certificate; Pro features are switched on in the database there", mark: "partial" } },
        { label: "Webhooks", ozvi: { text: "Signed, with retries and a delivery log", mark: "yes" }, them: { text: "Switched off after a single failure, and they stay off", mark: "partial" } },
        { label: "Privacy", ozvi: { text: "Fonts served from our own server, not Google Fonts; export and deletion of a user's data", mark: "yes" }, them: { text: "Reported issues: voter e-mails visible, fonts from Google Fonts", mark: "partial" } },
        { label: "Licence", ozvi: { text: "Source-available (FSL), Apache 2.0 after two years; SDK and widget MIT" }, them: { text: "AGPL-3.0" } },
        { label: "Running it yourself", ozvi: { text: "One Docker image and Postgres, every feature for €0", mark: "yes" }, them: { text: "One Go binary and PostgreSQL, very simple", mark: "yes" } },
        { label: "Hosted version", ozvi: { text: `Free €0, Pro ${f.pro} a year or ${f.proQuarter} a quarter, no record limit` }, them: { text: "Free up to 250 items, Pro $25 a month" } },
      ],
      note: "Vote counts are from Fider's public board (feedback.fider.io).",
    },
    pickThem: {
      title: "When to stay with Fider",
      items: [
        "You need an OSI-approved AGPL licence; Ozvi is source-available under the FSL, which turns into Apache 2.0 only after two years.",
        "You want as few moving parts as possible: one Go binary and a database.",
        "A public ideas board is enough; you need neither a widget nor private bug reports.",
        "Your app already is an OAuth/OIDC provider, or sign-in with an e-mail code suits you.",
      ],
    },
    pickOzvi: {
      title: "When to move to Ozvi",
      items: [
        "Users should report bugs right inside your app, and the team should get the screenshot, version and console errors.",
        "Users should reach the board from your app without signing in again.",
        "You miss features Fider's board has waited years for: vote limits, internal notes, custom statuses.",
        "You want GitHub, Linear, Jira, MCP for AI assistants, and webhooks that do not switch off after an outage.",
      ],
    },
    migrate: {
      title: "Moving from Fider",
      text: "The Fider import lives in Admin → Import. You see a preview first and nothing is saved; then the import runs in the background. Nobody gets an e-mail or a webhook, running it again brings over only what is new in Fider, and the whole run can be undone.",
      steps: [
        "In Fider download a backup (Administration → Export → Backup, up to 25 MB), or have an administrator API key ready.",
        "In Ozvi open Admin → Import → Fider and pick, in the preview, the tag that marks bugs and the sign-in provider of your app.",
        "Posts with the bug tag become private bug reports, the rest ideas; numbers stay when they are free. Votes, comments, tags, statuses and attachments come across, duplicates are merged.",
        "Users with an identity from your app are matched to their votes the first time they sign in through SSO.",
      ],
    },
    faq: [
      { q: "Does the Fider import keep votes and comments?", a: "Yes. Ideas, votes, comments, tags with the same visibility, statuses, team responses and attachments stored in Fider come across. Duplicates are merged into the original, and post numbers stay when they are free on the board." },
      { q: "Do users have to sign up again after the move?", a: "No. If they signed in to Fider through your app, Ozvi keeps their id from your app, so their first SSO sign-in reaches the same person with their votes. Everyone else is matched by e-mail." },
      { q: "Can I try the migration and undo it?", a: "Yes. The preview saves nothing, nobody gets an e-mail or a webhook during the import, and the whole import can be undone in Admin → Import, files included. Running it again brings only new posts." },
      { q: "How does Ozvi's licence compare with Fider's?", a: "Ozvi is source-available under the FSL, which turns into Apache 2.0 after two years. On your own server you get every feature for free, but the licence does not allow running Ozvi as a competing hosted service. The SDK and widget are MIT. Fider is AGPL-3.0." },
      { q: "How does Ozvi's price compare with hosted Fider?", a: `Hosted Fider Pro costs $25 a month. Ozvi Pro costs ${f.pro} a year or ${f.proQuarter} a quarter (excl. VAT), Free needs no card, and on your own server you pay €0.` },
    ],
    sources,
  }),
};
