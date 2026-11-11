import type { PageContent } from "../types";

/*
 * Featurebase facts (research of November 2026, "Analýza trhu feedback nástrojov" and "Ozvi funkčné
 * medzery a príležitosti"): seats as the value metric since December 2025, Growth $29/seat billed
 * yearly, branding removal $69/month from Professional, $246/month for three admins, Inbox / Slack
 * Support / Salesforce / mobile app / Product Tours in 2026, Fibi $0.49 per resolution, MCP with 168
 * tools and allow/ask/off, AI spam filter, MRR prioritisation, guest voting, follow-up questions after
 * an upvote, ~718 kB SDK, mobile through a WebView, changelog without automatic notifications, no
 * accessibility statement found.
 */

const sources = [
  { label: "Featurebase – pricing", href: "https://www.featurebase.app/pricing" },
  { label: "Featurebase Help – pricing update (Dec 2025)", href: "https://help.featurebase.app/articles/7287220-pricing-update-dec-2025" },
  { label: "Featurebase – changelog", href: "https://feedback.featurebase.app/changelog" },
  { label: "Featurebase – MCP", href: "https://www.featurebase.app/integrations/mcp" },
  { label: "Featurebase – announce updates", href: "https://www.featurebase.app/features/announce-updates" },
  { label: "Featurebase Help – mobile apps", href: "https://help.featurebase.app/articles/1131771-embed-featurebase-into-mobile-app" },
  { label: "Featurebase – SDK", href: "https://do.featurebase.app/js/sdk.js" },
  { label: "Featurebase – Improve accessibility (board)", href: "https://feedback.featurebase.app/p/improve-accessibility" },
];

export const featurebase: PageContent = {
  sk: (f) => ({
    meta: {
      title: "Ozvi vs Featurebase: porovnanie ceny a funkcií – Ozvi",
      description: "Featurebase rastie k helpdesku a účtuje za každého člena tímu. Ozvi je board a hlásenia chýb za pevnú ročnú cenu. Porovnanie funkcií a kedy je lepší Featurebase.",
    },
    them: "Featurebase",
    h1: "Ozvi vs Featurebase",
    answer: [
      "Featurebase sa v roku 2026 rozšíril na helpdesk: pribudla schránka podpory, podpora cez Slack, synchronizácia so Salesforce, mobilná aplikácia a produktové prehliadky. Od decembra 2025 účtuje hlavne podľa počtu členov tímu a AI agent na podporu stojí za každú vyriešenú konverzáciu.",
      `Ozvi zostáva pri spätnej väzbe: verejný board na nápady s roadmapou a novinkami a súkromné hlásenia chýb s technickým kontextom. Platíte pevnú cenu za rok bez ohľadu na veľkosť tímu (Pro ${f.pro}, Studio ${f.studio}). Ak chcete feedback a podporu zákazníkov v jednom nástroji, je lepší Featurebase.`,
    ],
    table: {
      caption: "Porovnanie Ozvi a Featurebase podľa funkcií",
      rows: [
        { label: "Ako sa účtuje", ozvi: { text: `Pevná cena za rok: Free 0 €, Pro ${f.pro}, Studio ${f.studio} (bez DPH)` }, them: { text: "Podľa počtu členov tímu; Growth $29 za člena mesačne pri ročnej platbe" } },
        { label: "Vlastná doména, prihlásenie z appky a bez značky, tím troch ľudí", ozvi: { text: `${f.pro} ročne` }, them: { text: "$246 mesačne pri ročnej platbe" } },
        { label: "Členovia tímu", ozvi: { text: "Neobmedzení v každom pláne", mark: "yes" }, them: { text: "Každý člen zvyšuje cenu", mark: "partial" } },
        { label: "Bez značky nástroja", ozvi: { text: `Od Pro (${f.pro} ročne)`, mark: "yes" }, them: { text: "Príplatok $69 mesačne, až od plánu Professional", mark: "partial" } },
        { label: "Súkromné hlásenia chýb so screenshotom, verziou a chybami z konzoly", ozvi: { text: "Áno, widget ich pribalí sám; hlásenie vidí len autor a tím", mark: "yes" }, them: { text: "Nie je súčasťou ponuky; Featurebase zbiera nápady a spätnú väzbu", mark: "no" } },
        { label: "Schránka podpory a AI agent na podporu", ozvi: { text: "Nie, Ozvi je len na spätnú väzbu", mark: "no" }, them: { text: "Schránka, podpora cez Slack, AI agent Fibi za $0,49 za vyriešenú konverzáciu", mark: "yes" } },
        { label: "Oznámenie hlasujúcim pri vydaní", ozvi: { text: "Novinka pošle e-mail každému, kto za nápad hlasoval", mark: "yes" }, them: { text: "Changelog podľa ich stránky automaticky neupozorní nikoho", mark: "no" } },
        { label: "MCP pre AI asistentov", ozvi: { text: "V každom pláne; zlúčenie a zverejnenie čakajú na potvrdenie", mark: "yes" }, them: { text: "168 nástrojov, pre každý voľba povoliť, pýtať sa alebo vypnúť; oddelené čítanie a zápis", mark: "yes" } },
        { label: "Hlasovanie bez prihlásenia", ozvi: { text: "Nie, prihlásenie je povinné (cez vašu appku alebo kódom do e-mailu)", mark: "no" }, them: { text: "Áno, hlasovať môžu aj hostia", mark: "yes" } },
        { label: "Ochrana proti spamu", ozvi: { text: "Limity príspevkov a komentárov, schvaľovanie nových nápadov a komentárov s odkazmi", mark: "yes" }, them: { text: "AI filter spamu (od júla 2026)", mark: "yes" } },
        { label: "Prehľad podľa zákazníkov", ozvi: { text: "Plán, firma a MRR zo SSO tokenu, triedenie podľa MRR", mark: "yes" }, them: { text: "Priorizácia podľa tržieb zákazníka", mark: "yes" } },
        { label: "Veľkosť widgetu", ozvi: { text: "menej ako 20 kB gzip, shadow DOM", mark: "yes" }, them: { text: "Prvý skript približne 718 kB", mark: "no" } },
        { label: "Mobilná aplikácia", ozvi: { text: "Board funguje v mobilnom prehliadači, natívne SDK nemáme", mark: "partial" }, them: { text: "Mobilná aplikácia; do appiek cez WebView s JWT v adrese", mark: "partial" } },
        { label: "Vyhlásenie o prístupnosti", ozvi: { text: "Áno, čiastočný súlad s WCAG 2.2 AA, so zoznamom nedostatkov", mark: "yes" }, them: { text: "Vyhlásenie sme nenašli; na ich boarde sú nahlásené nepreložené popisy pre čítačky a tlačidlá mimo klávesnice", mark: "no" } },
        { label: "Vlastný server", ozvi: { text: "Jeden Docker image a Postgres, všetky funkcie za 0 €, verejný zdrojový kód (FSL)", mark: "yes" }, them: { text: "Hostovaná služba" } },
      ],
      note: "Ceny Featurebase sú v USD podľa ich cenníka, ceny Ozvi v eurách bez DPH.",
    },
    pickThem: {
      title: "Kedy zvoliť Featurebase",
      items: [
        "Chcete spätnú väzbu, podporu zákazníkov a AI agenta na odpovede v jednom produkte.",
        "Potrebujete synchronizáciu so Salesforce, produktové prehliadky alebo mobilnú aplikáciu.",
        "Hlasovať majú aj návštevníci bez prihlásenia.",
        "Váš AI asistent má mať veľmi veľa nástrojov s nastavením pre každý z nich.",
      ],
    },
    pickOzvi: {
      title: "Kedy zvoliť Ozvi",
      items: [
        "Tím rastie a nechcete platiť za každého, kto na boarde odpovedá.",
        "Potrebujete súkromné hlásenia chýb so screenshotom a chybami z konzoly, nielen nápady.",
        "Widget má byť malý a v shadow DOM, aby nespomalil ani nerozbil vašu aplikáciu.",
        "Chcete hlasujúcim dať vedieť pri každom vydaní a mať board po slovensky, s dátami v EÚ alebo na vlastnom serveri.",
      ],
    },
    migrate: {
      title: "Ako začať s Ozvi",
      text: "Priamy import z Featurebase zatiaľ nemáme. Nápady, hlasy a komentáre prenesiete cez import z tabuľky (CSV): najprv uvidíte náhľad, potom import beží na pozadí, nikomu nejde e-mail a celý beh sa dá vrátiť späť.",
      steps: [
        "Založte si projekt v pláne Free.",
        "Pripravte príspevky ako tabuľku (CSV) a nahrajte ich v Admin → Import; stĺpce priradíte v náhľade.",
        "Vložte widget do aplikácie a prepojte prihlásenie podpísaným tokenom alebo cez OIDC.",
        "Pozvite tím. Za ďalších ľudí neplatíte.",
      ],
    },
    faq: [
      { q: "Koľko stojí Featurebase pre tím troch ľudí?", a: "Podľa cenníka Featurebase vychádza najlacnejší plán s vlastnou doménou, prihlásením z vašej appky a bez ich značky na $246 mesačne pri ročnej platbe, lebo odstránenie značky je príplatok $69 mesačne od plánu Professional. V Ozvi to isté pokrýva plán Pro za " + f.pro + " ročne pre celý tím." },
      { q: "Nahradí Ozvi helpdesk z Featurebase?", a: "Nie. Ozvi nemá schránku podpory ani AI agenta, ktorý odpovedá zákazníkom. Rieši hlásenia chýb, nápady, roadmapu a novinky. Ak podporu riešite vo Featurebase, Ozvi ju nenahradí." },
      { q: "Prenesiem dáta z Featurebase?", a: "Áno, cez import z CSV. Priamy import z Featurebase cez API zatiaľ nemáme; z Fideru a Canny áno." },
      { q: "Môžu u vás hlasovať aj neprihlásení návštevníci?", a: "Nie. V Ozvi sa hlasuje po prihlásení, najčastejšie automaticky cez vašu aplikáciu, inak kódom do e-mailu. Tím tak vie, kto čo chce, a board sa nezaplní spamom." },
      { q: "Prečo záleží na veľkosti widgetu?", a: "Widget sa načíta do každej stránky vašej aplikácie. Widget Ozvi má menej ako 20 kB gzip a beží v shadow DOM, takže nemení vaše štýly ani skripty. Prvý skript Featurebase mal pri meraní približne 718 kB." },
    ],
    sources,
  }),
  en: (f) => ({
    meta: {
      title: "Ozvi vs Featurebase: pricing and features compared – Ozvi",
      description: "Featurebase is growing into a helpdesk and bills per team seat. Ozvi is a board plus bug reports at a flat yearly price. Features compared, and when Featurebase wins.",
    },
    them: "Featurebase",
    h1: "Ozvi vs Featurebase",
    answer: [
      "In 2026 Featurebase grew into a helpdesk: a support inbox, Slack support, Salesforce sync, a mobile app and product tours. Since December 2025 it bills mainly by team seats, and its AI support agent is charged per resolved conversation.",
      `Ozvi stays with feedback: a public ideas board with a roadmap and release notes, plus private bug reports with technical context. You pay a flat yearly price whatever the size of your team (Pro ${f.pro}, Studio ${f.studio}). If you want feedback and customer support in one tool, Featurebase is the better fit.`,
    ],
    table: {
      caption: "Ozvi and Featurebase compared by feature",
      rows: [
        { label: "How it is billed", ozvi: { text: `Flat yearly price: Free €0, Pro ${f.pro}, Studio ${f.studio} (excl. VAT)` }, them: { text: "By team seats; Growth $29 per seat a month billed yearly" } },
        { label: "Own domain, sign-in from your app and no branding, team of three", ozvi: { text: `${f.pro} a year` }, them: { text: "$246 a month billed yearly" } },
        { label: "Team members", ozvi: { text: "Unlimited in every plan", mark: "yes" }, them: { text: "Every seat adds to the price", mark: "partial" } },
        { label: "No vendor branding", ozvi: { text: `From Pro (${f.pro} a year)`, mark: "yes" }, them: { text: "$69 a month add-on, from the Professional plan only", mark: "partial" } },
        { label: "Private bug reports with screenshot, version and console errors", ozvi: { text: "Yes, the widget attaches them; only the reporter and the team see the report", mark: "yes" }, them: { text: "Not part of the product; Featurebase collects ideas and feedback", mark: "no" } },
        { label: "Support inbox and AI support agent", ozvi: { text: "No, Ozvi is for feedback only", mark: "no" }, them: { text: "Inbox, Slack support, AI agent Fibi at $0.49 per resolved conversation", mark: "yes" } },
        { label: "Telling voters when an idea ships", ozvi: { text: "A release note e-mails everyone who voted for the idea", mark: "yes" }, them: { text: "According to its own page, the changelog notifies no one automatically", mark: "no" } },
        { label: "MCP for AI assistants", ozvi: { text: "In every plan; merging and publishing wait for confirmation", mark: "yes" }, them: { text: "168 tools, each set to allow, ask or off; separate read and write tools", mark: "yes" } },
        { label: "Voting without signing in", ozvi: { text: "No, sign-in is required (through your app or with an e-mail code)", mark: "no" }, them: { text: "Yes, guests can vote", mark: "yes" } },
        { label: "Spam protection", ozvi: { text: "Rate limits on posts and comments, approval of new ideas and of comments with links", mark: "yes" }, them: { text: "AI spam filter (since July 2026)", mark: "yes" } },
        { label: "View by customer", ozvi: { text: "Plan, company and MRR from the SSO token, sort by MRR", mark: "yes" }, them: { text: "Prioritisation by customer revenue", mark: "yes" } },
        { label: "Widget size", ozvi: { text: "under 20 kB gzip, shadow DOM", mark: "yes" }, them: { text: "First script about 718 kB", mark: "no" } },
        { label: "Mobile", ozvi: { text: "The board works in a mobile browser, no native SDK", mark: "partial" }, them: { text: "A mobile app; inside apps through a WebView with a JWT in the URL", mark: "partial" } },
        { label: "Accessibility statement", ozvi: { text: "Yes, partial conformance with WCAG 2.2 AA, with the known gaps listed", mark: "yes" }, them: { text: "None found; its own board reports untranslated screen-reader labels and buttons out of keyboard reach", mark: "no" } },
        { label: "Self-hosting", ozvi: { text: "One Docker image and Postgres, every feature for €0, source-available (FSL)", mark: "yes" }, them: { text: "Hosted service" } },
      ],
      note: "Featurebase prices in USD as listed on its pricing page, Ozvi prices in euro excluding VAT.",
    },
    pickThem: {
      title: "When to pick Featurebase",
      items: [
        "You want feedback, customer support and an AI agent that answers customers in one product.",
        "You need Salesforce sync, product tours or a mobile app.",
        "Visitors should be able to vote without signing in.",
        "Your AI assistant should get a very large set of tools with a setting for each.",
      ],
    },
    pickOzvi: {
      title: "When to pick Ozvi",
      items: [
        "Your team is growing and you do not want to pay for everyone who answers on the board.",
        "You need private bug reports with a screenshot and console errors, not only ideas.",
        "The widget should be small and live in a shadow DOM so it neither slows down nor breaks your app.",
        "You want voters told at every release and a board in Slovak or Czech, with data in the EU or on your own server.",
      ],
    },
    migrate: {
      title: "Getting started with Ozvi",
      text: "There is no direct Featurebase import yet. Bring ideas, votes and comments over with the spreadsheet (CSV) import: you see a preview first, then the import runs in the background, nobody gets an e-mail and the whole run can be undone.",
      steps: [
        "Create a project on the Free plan.",
        "Put your posts in a spreadsheet (CSV) and upload it in Admin → Import; you map the columns in the preview.",
        "Add the widget to your app and connect sign-in with a signed token or OIDC.",
        "Invite your team. More people cost nothing.",
      ],
    },
    faq: [
      { q: "What does Featurebase cost for a team of three?", a: "By Featurebase's pricing, the cheapest setup with your own domain, sign-in from your app and no Featurebase branding comes to $246 a month billed yearly, because removing the branding is a $69 a month add-on from the Professional plan. In Ozvi the Pro plan covers the same for " + f.pro + " a year for the whole team." },
      { q: "Will Ozvi replace the Featurebase helpdesk?", a: "No. Ozvi has no support inbox or AI agent that answers customers. It handles bug reports, ideas, the roadmap and release notes. If you run support in Featurebase, Ozvi will not replace that." },
      { q: "Can I move my data from Featurebase?", a: "Yes, through the CSV import. A direct API import from Featurebase does not exist yet; there is one for Fider and Canny." },
      { q: "Can visitors vote without signing in?", a: "No. In Ozvi people vote after signing in, usually automatically through your app, otherwise with an e-mail code. Your team knows who wants what, and the board does not fill up with spam." },
      { q: "Why does widget size matter?", a: "The widget loads on every page of your app. Ozvi's widget is under 20 kB gzip and runs in a shadow DOM, so it does not touch your styles or scripts. Featurebase's first script measured about 718 kB." },
    ],
    sources,
  }),
};
