import type { PageContent } from "../types";

/*
 * Canny facts (research of November 2026, "Analýza trhu feedback nástrojov" and "Ozvi funkčné medzery
 * a príležitosti"): billing by tracked users and the tier prices from Canny's help and pricing pages,
 * Autopilot, MCP with role permissions, SSO integrations in Business, branding as a Business add-on,
 * widget theme light/dark/auto, ~14.3 kB SDK, translations without Slovak and Czech, data in the USA,
 * segments from Pro and CRM sync in Business, no anonymous voting.
 */

const sources = [
  { label: "Canny – pricing", href: "https://canny.io/pricing" },
  { label: "Canny Help – billing plans", href: "https://help.canny.io/en/articles/9131812-canny-s-billing-plans" },
  { label: "Canny Help – MCP server", href: "https://help.canny.io/en/articles/13063190-mcp-server" },
  { label: "Canny – SSO (developers)", href: "https://developers.canny.io/install/widget/sso" },
  { label: "Canny – widget (developers)", href: "https://developers.canny.io/install/widget/web" },
  { label: "Canny Help – language translations", href: "https://help.canny.io/en/articles/9091829-beta-language-translations" },
  { label: "Canny – privacy", href: "https://canny.io/privacy" },
];

export const canny: PageContent = {
  sk: (f) => ({
    meta: {
      title: "Ozvi vs Canny: porovnanie ceny a funkcií – Ozvi",
      description: "Canny účtuje podľa počtu aktívnych používateľov, Ozvi má pevnú ročnú cenu. Porovnanie SSO, hlásení chýb, MCP, jazykov a dát v EÚ, aj kedy je lepší Canny.",
    },
    them: "Canny",
    h1: "Ozvi vs Canny",
    answer: [
      `Canny je zrelá platforma na spätnú väzbu: AI zbiera požiadavky z podpory, má desiatky integrácií a rozsiahly MCP server. Cena sa však odvíja od počtu koncových používateľov, ktorí hlasujú, píšu alebo komentujú, takže rastie spolu s aktivitou boardu.`,
      `Ozvi stojí rovnako bez ohľadu na počet používateľov (Pro ${f.pro} ročne, Studio ${f.studio} ročne) a k verejnému boardu pridáva súkromné hlásenia chýb so screenshotom a technickými údajmi. Prihlásenie z vašej aplikácie, MCP aj GitHub sú v každom pláne. Ak potrebujete zber feedbacku z podpory a CRM synchronizáciu, siahnite po Canny.`,
    ],
    table: {
      caption: "Porovnanie Ozvi a Canny podľa funkcií",
      rows: [
        { label: "Ako sa účtuje", ozvi: { text: `Pevná cena za rok: Free 0 €, Pro ${f.pro}, Studio ${f.studio} (bez DPH)` }, them: { text: "Podľa „tracked users“: každý, kto zahlasuje, napíše príspevok alebo komentár" } },
        { label: "Cena pri 2 000 aktívnych používateľoch", ozvi: { text: `Rovnaká ako pri 10: od 0 €, s vlastnou doménou ${f.pro} ročne` }, them: { text: "Pro $729 mesačne pri ročnej platbe ($911 pri mesačnej)" } },
        { label: "Počet používateľov a záznamov", ozvi: { text: "Neobmedzený v každom pláne", mark: "yes" }, them: { text: "Určuje cenu; bez limitu výdavkov prejde účet na vyšší tier sám, s limitom prestane zbierať feedback od nových ľudí", mark: "partial" } },
        { label: "Súkromné hlásenia chýb so screenshotom, verziou a chybami z konzoly", ozvi: { text: "Áno, widget ich pribalí sám; hlásenie vidí len autor a tím", mark: "yes" }, them: { text: "Nie je súčasťou ponuky; Canny je board na nápady a spätnú väzbu", mark: "no" } },
        { label: "Autor sa dozvie, že je chyba opravená", ozvi: { text: "E-mail „opravené vo verzii 2.15, funguje vám to?“, odpoveď „nefunguje“ chybu znova otvorí", mark: "yes" }, them: { text: "Hlasujúci dostanú správu pri dodaní nápadu", mark: "partial" } },
        { label: "Prihlásenie z vašej aplikácie", ozvi: { text: "Podpísaný token (HS256) alebo OIDC, v každom pláne vrátane Free", mark: "yes" }, them: { text: "JWT (HS256) vo widgete; „SSO integrations“ až v pláne Business", mark: "partial" } },
        { label: "Bez značky nástroja", ozvi: { text: `Od Pro (${f.pro} ročne)`, mark: "yes" }, them: { text: "Príplatok k plánu Business", mark: "partial" } },
        { label: "MCP pre AI asistentov", ozvi: { text: "V každom pláne; zlúčenie a zverejnenie čakajú na vaše potvrdenie", mark: "yes" }, them: { text: "Od Pro, viac ako 55 nástrojov, práva podľa rolí (zlúčiť a mazať smie len Manager alebo Owner)", mark: "yes" } },
        { label: "AI zber požiadaviek z podpory", ozvi: { text: "Nie; AI v Ozvi hľadá duplicity, zhŕňa diskusie a navrhuje novinky (Studio)", mark: "no" }, them: { text: "Autopilot nájde feedback v konverzáciách podpory a zlúči duplicity; nájdení ľudia sa rátajú do tracked users", mark: "yes" } },
        { label: "Prehľad podľa zákazníkov", ozvi: { text: "Plán, firma a MRR zo SSO tokenu, triedenie podľa MRR", mark: "yes" }, them: { text: "Segmenty od Pro, synchronizácia s CRM v Business", mark: "yes" } },
        { label: "Vzhľad widgetu", ozvi: { text: "Farby, písmo, zaoblenie a logo z témy; shadow DOM, menej ako 20 kB gzip", mark: "yes" }, them: { text: "Téma light, dark alebo auto; skript približne 14,3 kB", mark: "partial" } },
        { label: "Slovenčina a čeština", ozvi: { text: "Áno, plus angličtina, poľština, maďarčina a nemčina; AI preklad príspevkov od Pro", mark: "yes" }, them: { text: "Preklady v 14 jazykoch v platených plánoch, bez slovenčiny a češtiny", mark: "no" } },
        { label: "Kde sú dáta", ozvi: { text: "Cloud v dátovom centre v Nemecku (EÚ) alebo váš vlastný server", mark: "yes" }, them: { text: "USA", mark: "no" } },
        { label: "Vlastný server", ozvi: { text: "Jeden Docker image a Postgres, všetky funkcie za 0 €, verejný zdrojový kód (FSL)", mark: "yes" }, them: { text: "Hostovaná služba" } },
      ],
      note: "Ceny Canny sú v USD podľa ich cenníka, ceny Ozvi v eurách bez DPH.",
    },
    pickThem: {
      title: "Kedy zvoliť Canny",
      items: [
        "Chcete, aby AI sama vyťahovala požiadavky z konverzácií podpory a predajných hovorov.",
        "Potrebujete synchronizáciu s CRM a široký katalóg hotových integrácií.",
        "Váš AI asistent má mať k dispozícii veľa nástrojov s jemne nastavenými právami podľa rolí.",
        "Hlasuje u vás málo ľudí, takže cena podľa tracked users ostane nízka, a dáta v USA vám nevadia.",
      ],
    },
    pickOzvi: {
      title: "Kedy zvoliť Ozvi",
      items: [
        "Chcete predvídateľnú cenu, ktorá nerastie s počtom hlasujúcich.",
        "Popri nápadoch zbierate aj hlásenia chýb a chcete ich mať súkromne, so screenshotom a chybami z konzoly.",
        "Používatelia sa majú prihlásiť cez vašu aplikáciu bez ďalšieho účtu, aj v pláne Free.",
        "Board a e-maily majú byť po slovensky alebo česky a dáta v EÚ, prípadne na vašom serveri.",
      ],
    },
    migrate: {
      title: "Prechod z Canny",
      text: "Ozvi importuje z Canny cez API alebo z CSV exportu. Najprv uvidíte náhľad, nič sa neuloží, potom import beží na pozadí. Počas importu nikomu nejde e-mail ani webhook a celý beh sa dá vrátiť späť.",
      steps: [
        "Založte si projekt v pláne Free.",
        "V Admin → Import zvoľte Canny a vložte API kľúč. Kľúč sa použije len na tento import, neukladá sa.",
        "Každému boardu z Canny určíte, či sú to nápady, alebo chyby. Prenesú sa príspevky, hlasy aj s dôležitosťou, komentáre, interné komentáre ako poznámky tímu, štítky a firma s MRR zákazníka.",
        "Vložte widget do aplikácie a prepojte prihlásenie podpísaným tokenom.",
      ],
    },
    faq: [
      { q: "Prečo je Canny pri väčšom boarde drahší?", a: "Canny počíta tracked users, teda každého, kto zahlasoval, napísal príspevok alebo komentár, a aj ľudí, ktorých feedback našiel Autopilot. Pri 1 000 takých ľuďoch stojí Pro $529 mesačne pri ročnej platbe, pri 2 000 už $729. Ozvi používateľov ani záznamy nepočíta." },
      { q: "Prenesiem hlasy a komentáre z Canny?", a: "Áno. Import z Canny prenesie príspevky, hlasy, komentáre a štítky. Interné komentáre budú poznámky len pre tím a firma a mesačné tržby zákazníka sa zachovajú, takže môžete hneď triediť podľa MRR. Opakovaný import nič nezdvojí." },
      { q: "Má Ozvi niečo ako Canny Autopilot?", a: "Nie. Ozvi nezbiera feedback z podpory ani z hovorov. AI v pláne Studio hľadá duplicity, zhŕňa diskusie a pripravuje koncepty noviniek; všetko vidí len tím a nič sa nezverejní bez človeka." },
      { q: "Funguje prihlásenie z mojej aplikácie aj vo Free pláne?", a: "Áno. Podpísaný token (HS256), OIDC aj MCP, GitHub a webhooky sú v každom pláne. Plány v cloude sa líšia len v tom, čo nás stojí peniaze: e-maily, úložisko, počet projektov, vlastná doména, odznak Ozvi a AI." },
      { q: "Kde má Ozvi dáta?", a: "Cloud beží v dátovom centre v Nemecku. Ak chcete dáta úplne u seba, Ozvi spustíte na vlastnom serveri so všetkými funkciami zadarmo." },
    ],
    sources,
  }),
  en: (f) => ({
    meta: {
      title: "Ozvi vs Canny: pricing and features compared – Ozvi",
      description: "Canny bills by active end users, Ozvi has a flat yearly price. SSO, bug reports, MCP, languages and EU hosting compared, and when Canny is the better pick.",
    },
    them: "Canny",
    h1: "Ozvi vs Canny",
    answer: [
      "Canny is a mature feedback platform: its AI pulls requests out of support conversations, it has dozens of integrations and a large MCP server. Its price follows the number of end users who vote, post or comment, so it grows as your board gets busier.",
      `Ozvi costs the same however many people use it (Pro ${f.pro} a year, Studio ${f.studio} a year) and adds private bug reports with a screenshot and technical details next to the public board. Sign-in from your app, MCP and GitHub are in every plan. If you need feedback capture from support and CRM sync, go with Canny.`,
    ],
    table: {
      caption: "Ozvi and Canny compared by feature",
      rows: [
        { label: "How it is billed", ozvi: { text: `Flat yearly price: Free €0, Pro ${f.pro}, Studio ${f.studio} (excl. VAT)` }, them: { text: "By “tracked users”: anyone who votes, posts or comments" } },
        { label: "Price at 2,000 active users", ozvi: { text: `The same as at 10: from €0, with your own domain ${f.pro} a year` }, them: { text: "Pro $729 a month billed yearly ($911 billed monthly)" } },
        { label: "Users and records", ozvi: { text: "Unlimited in every plan", mark: "yes" }, them: { text: "Sets the price; without a spending limit the account moves up a tier on its own, with one it stops tracking feedback from new users", mark: "partial" } },
        { label: "Private bug reports with screenshot, version and console errors", ozvi: { text: "Yes, the widget attaches them; only the reporter and the team see the report", mark: "yes" }, them: { text: "Not part of the product; Canny is an ideas and feedback board", mark: "no" } },
        { label: "Reporter learns the bug is fixed", ozvi: { text: "E-mail “fixed in version 2.15, does it work for you?”; answering “not yet” reopens it", mark: "yes" }, them: { text: "Voters hear back when an idea ships", mark: "partial" } },
        { label: "Sign-in from your app", ozvi: { text: "Signed token (HS256) or OIDC, in every plan including Free", mark: "yes" }, them: { text: "JWT (HS256) in the widget; “SSO integrations” only on Business", mark: "partial" } },
        { label: "No vendor branding", ozvi: { text: `From Pro (${f.pro} a year)`, mark: "yes" }, them: { text: "Paid add-on to Business", mark: "partial" } },
        { label: "MCP for AI assistants", ozvi: { text: "In every plan; merging and publishing wait for your confirmation", mark: "yes" }, them: { text: "From Pro, 55+ tools, role-based permissions (only a Manager or Owner may merge and delete)", mark: "yes" } },
        { label: "AI capture of requests from support", ozvi: { text: "No; Ozvi's AI finds duplicates, summarises threads and drafts release notes (Studio)", mark: "no" }, them: { text: "Autopilot finds feedback in support conversations and merges duplicates; the people it finds count as tracked users", mark: "yes" } },
        { label: "View by customer", ozvi: { text: "Plan, company and MRR from the SSO token, sort by MRR", mark: "yes" }, them: { text: "Segments from Pro, CRM sync on Business", mark: "yes" } },
        { label: "Widget look", ozvi: { text: "Colours, font, radius and logo from the theme; shadow DOM, under 20 kB gzip", mark: "yes" }, them: { text: "Light, dark or auto theme; script about 14.3 kB", mark: "partial" } },
        { label: "Slovak and Czech", ozvi: { text: "Yes, plus English, Polish, Hungarian and German; AI translation of posts from Pro", mark: "yes" }, them: { text: "Translations into 14 languages on paid plans, without Slovak or Czech", mark: "no" } },
        { label: "Where the data lives", ozvi: { text: "Cloud in a data centre in Germany (EU), or your own server", mark: "yes" }, them: { text: "USA", mark: "no" } },
        { label: "Self-hosting", ozvi: { text: "One Docker image and Postgres, every feature for €0, source-available (FSL)", mark: "yes" }, them: { text: "Hosted service" } },
      ],
      note: "Canny prices in USD as listed on its pricing page, Ozvi prices in euro excluding VAT.",
    },
    pickThem: {
      title: "When to pick Canny",
      items: [
        "You want AI to pull requests out of support conversations and sales calls on its own.",
        "You need CRM sync and a wide catalogue of ready-made integrations.",
        "Your AI assistant should get many tools with fine-grained, role-based permissions.",
        "Few people vote on your board, so pricing by tracked users stays low, and US hosting is fine for you.",
      ],
    },
    pickOzvi: {
      title: "When to pick Ozvi",
      items: [
        "You want a predictable price that does not grow with the number of voters.",
        "Besides ideas you collect bug reports and want them private, with a screenshot and console errors.",
        "Users should sign in through your app without another account, on the Free plan too.",
        "Your board and e-mails should speak Slovak or Czech and your data should stay in the EU, or on your own server.",
      ],
    },
    migrate: {
      title: "Moving from Canny",
      text: "Ozvi imports from Canny through its API or from a CSV export. You see a preview first and nothing is saved; then the import runs in the background. Nobody gets an e-mail or a webhook during the import, and the whole run can be undone.",
      steps: [
        "Create a project on the Free plan.",
        "In Admin → Import pick Canny and paste your API key. The key is used for this import only and never stored.",
        "Decide for each Canny board whether it holds ideas or bugs. Posts, votes with their priority, comments, internal comments as team notes, tags and the customer's company with MRR come across.",
        "Add the widget to your app and connect sign-in with a signed token.",
      ],
    },
    faq: [
      { q: "Why does Canny cost more as the board grows?", a: "Canny counts tracked users: everyone who voted, posted or commented, plus the people whose feedback Autopilot found. At 1,000 of them Pro costs $529 a month billed yearly, at 2,000 it is $729. Ozvi does not count users or records." },
      { q: "Can I bring my votes and comments over from Canny?", a: "Yes. The Canny import brings posts, votes, comments and tags. Internal comments become team-only notes, and the customer's company and monthly revenue are kept, so you can sort by MRR straight away. Running the import again duplicates nothing." },
      { q: "Does Ozvi have something like Canny Autopilot?", a: "No. Ozvi does not capture feedback from support or calls. On the Studio plan its AI finds duplicates, summarises threads and drafts release notes; only the team sees them and nothing is published without a person." },
      { q: "Does sign-in from my app work on the Free plan?", a: "Yes. Signed tokens (HS256), OIDC, MCP, GitHub and webhooks are in every plan. Cloud plans differ only in what costs us money: e-mails, storage, number of projects, custom domain, the Ozvi badge and AI." },
      { q: "Where does Ozvi keep the data?", a: "The cloud runs in a data centre in Germany. If you want the data entirely on your side, run Ozvi on your own server with every feature for free." },
    ],
    sources,
  }),
};
