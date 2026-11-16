import type { PageContent } from "../types";

/*
 * Sentry facts (checked on Sentry's own pages in November 2026): plan prices and the one-user free
 * Developer plan from the pricing page; the User Feedback widget (screenshots, not on mobile; replay;
 * link to errors; alerts for the team) from the product and JavaScript docs; self-hosted minimum
 * hardware and Docker Compose from the self-hosted developer docs. The docs do not describe any
 * message to the person who sent feedback, so the page says only that, without a mark.
 * Not a competitor page: Sentry is error monitoring, Ozvi is feedback. They complement each other.
 */

const sources = [
  { label: "Sentry – pricing", href: "https://sentry.io/pricing/" },
  { label: "Sentry Docs – User Feedback", href: "https://docs.sentry.io/product/user-feedback/" },
  { label: "Sentry Docs – User Feedback (JavaScript)", href: "https://docs.sentry.io/platforms/javascript/user-feedback/" },
  { label: "Sentry Developer Docs – self-hosted", href: "https://develop.sentry.dev/self-hosted/" },
];

export const sentry: PageContent = {
  sk: (f) => ({
    meta: {
      title: "Ozvi vs Sentry: spätná väzba a monitorovanie chýb – Ozvi",
      description: "Sentry zachytí, čo v kóde spadne. Ozvi zachytí, čo vám povedia ľudia, aj keď nič nespadlo. Kedy použiť ktorý nástroj a prečo sa dopĺňajú.",
    },
    them: "Sentry",
    h1: "Ozvi vs Sentry",
    answer: [
      "Sentry a Ozvi riešia iný problém. Sentry zachytí, čo v kóde spadne: výnimky so stack trace, pomalé požiadavky, session replay. Je to nástroj pre vývojárov a jeho widget User Feedback pripojí k týmto údajom aj slová používateľa.",
      "Ozvi zachytí, čo vám povedia ľudia, aj keď nič nespadlo: zlý súčet na faktúre, mätúce tlačidlo, chýbajúcu funkciu. Hlásenia chýb sú súkromné, nápady majú verejný board s hlasovaním, roadmapou a novinkami a autor dostane e-mail, keď je jeho chyba opravená. Nástroje sa dopĺňajú, my sami používame oba.",
    ],
    table: {
      caption: "Porovnanie Ozvi a Sentry podľa funkcií",
      rows: [
        { label: "Na čo slúži", ozvi: { text: "Spätná väzba od ľudí: hlásenia chýb, nápady, roadmapa a novinky" }, them: { text: "Monitorovanie aplikácie: chyby a výnimky v kóde, výkon, session replay, logy" } },
        { label: "Chyba, ktorá nič nevyhodí (zlý súčet na faktúre, mätúce tlačidlo)", ozvi: { text: "Používateľ ju nahlási cez widget, tím ju vidí s kontextom", mark: "yes" }, them: { text: "Len ak ju používateľ pošle cez widget User Feedback; automaticky Sentry zachytáva výnimky a výkonové problémy", mark: "partial" } },
        { label: "Výnimky, stack trace, výkon a release health", ozvi: { text: "Nie; k hláseniu pribalí chyby z konzoly prehliadača, nie je to monitoring", mark: "no" }, them: { text: "Hlavná úloha Sentry, aj bez toho, aby niekto niečo nahlásil", mark: "yes" } },
        { label: "Session replay", ozvi: { text: "Nie", mark: "no" }, them: { text: "Áno; k spätnej väzbe sa môže pripojiť záznam posledných sekúnd pred odoslaním", mark: "yes" } },
        { label: "Hlásenie od používateľa so screenshotom", ozvi: { text: "Screenshot, verzia aplikácie a chyby z konzoly; hlásenie vidí len autor a tím", mark: "yes" }, them: { text: "Widget User Feedback so screenshotom (na mobilných zariadeniach bez neho), replayom a odkazom na kontext chýb", mark: "yes" } },
        { label: "Spracovanie hlásení v tíme", ozvi: { text: "Stavy, interné poznámky a štítky, zlúčenie duplicít, issue na GitHube, v Lineari a Jire, AI zhrnutie (Studio)", mark: "yes" }, them: { text: "Schránka spätnej väzby: vyriešiť, označiť ako spam (aj pomocou AI), priradiť členovi tímu, issue na GitHube či v Jire, AI zhrnutie", mark: "yes" } },
        { label: "Autor sa dozvie, že je chyba opravená", ozvi: { text: "E-mail „opravené vo verzii 2.15, funguje vám to?“, odpoveď „nefunguje“ chybu znova otvorí", mark: "yes" }, them: { text: "Dokumentácia opisuje upozornenia pre tím; správu autorovi spätnej väzby neuvádza" } },
        { label: "Verejný board s hlasovaním, roadmapa, novinky", ozvi: { text: "Áno; hlasujúci dostanú e-mail, keď nápad dodáte", mark: "yes" }, them: { text: "Nie je súčasťou produktu; spätná väzba je určená tímu", mark: "no" } },
        { label: "Prihlásenie z vašej aplikácie", ozvi: { text: "Podpísaný token (HS256) alebo OIDC, v každom pláne vrátane Free", mark: "yes" }, them: { text: "Meno a e-mail vyplní používateľ alebo ich odovzdá SDK; vlastný účet nepotrebuje" } },
        { label: "Cena", ozvi: { text: `Free 0 €, Pro ${f.pro} ročne, Studio ${f.studio} ročne (bez DPH)` }, them: { text: "Developer zadarmo (5 000 chýb, 50 replayov mesačne), Team $26 a Business $80 mesačne pri ročnej platbe" } },
        { label: "Počet ľudí v tíme", ozvi: { text: "Neobmedzený v každom pláne", mark: "yes" }, them: { text: "Developer pre 1 používateľa, Team a vyššie neobmedzene", mark: "partial" } },
        { label: "Vlastný server", ozvi: { text: "Jeden Docker image a Postgres, všetky funkcie za 0 €, verejný zdrojový kód (FSL)", mark: "yes" }, them: { text: "Docker Compose, verejný zdrojový kód (FSL); minimum 4 jadrá, 16 GB RAM + 16 GB swap a 20 GB disku", mark: "yes" } },
      ],
      note: "Ceny Sentry sú v USD podľa ich cenníka, ceny Ozvi v eurách bez DPH.",
    },
    pickThem: {
      title: "Kedy zvoliť Sentry",
      items: [
        "Chcete vedieť o výnimkách a pádoch skôr, než ich niekto nahlási, so stack trace a kontextom.",
        "Sledujete výkon aplikácie: pomalé požiadavky, traces a release health.",
        "Potrebujete session replay, aby ste videli, čo používateľ robil pred chybou.",
        "Spätnú väzbu chcete mať priamo pri chybách a replayi v jednom nástroji pre vývojárov.",
      ],
    },
    pickOzvi: {
      title: "Kedy zvoliť Ozvi",
      items: [
        "Chcete počuť aj o problémoch, ktoré nič nevyhodia: zlý výpočet, nejasný text, chýbajúcu funkciu.",
        "Hlásenia chýb majú byť súkromné medzi autorom a tímom a autor sa má dozvedieť, že je chyba opravená.",
        "Nápady chcete zbierať verejne, s hlasovaním, roadmapou a novinkami.",
        "Používatelia sa majú prihlásiť cez vašu aplikáciu a board aj e-maily majú byť po slovensky alebo česky.",
      ],
    },
    migrate: {
      title: "Ako používať Ozvi a Sentry spolu",
      text: "Netreba vyberať jeden. Sentry stráži kód, Ozvi počúva ľudí. V aplikácii môžu bežať oba a každý robí to, na čo je stavaný.",
      steps: [
        "Sentry nechajte zachytávať výnimky a výkon ako doteraz.",
        "Založte si projekt Ozvi v pláne Free, vložte widget do aplikácie a prepojte prihlásenie podpísaným tokenom alebo OIDC.",
        "Hlásenia, za ktorými nie je žiadna výnimka, riešte v Ozvi; ak k hláseniu existuje issue v Sentry, odkážte naň v poznámke tímu.",
        "Keď chybu označíte za opravenú vo verzii, Ozvi napíše autorovi; keď dodáte nápad, dostanú e-mail tí, čo zaň hlasovali.",
      ],
    },
    faq: [
      { q: "Nestačí mi Sentry?", a: "Ak vás zaujíma, čo v kóde spadne, Sentry je správna voľba a Ozvi ho nenahradí. Veľa z toho, čo vám ľudia chcú povedať, však výnimku nikdy nevyhodí: nesprávny výpočet, nejasný postup, chýbajúca funkcia. Na to je Ozvi." },
      { q: "Nemá Sentry tiež widget na spätnú väzbu?", a: "Má. Widget User Feedback pošle správu so screenshotom (na mobile bez neho) a môže k nej pripojiť session replay a kontext chýb. Tím ju v Sentry vyrieši, priradí alebo z nej urobí issue. Dokumentácia však neopisuje žiadnu správu späť autorovi a Sentry neponúka verejný board s hlasovaním, roadmapu ani novinky. Sentry User Feedback je nástroj na ladenie, Ozvi na rozhovor so zákazníkom." },
      { q: "Má Ozvi monitorovanie chýb alebo výkonu?", a: "Nie. Widget Ozvi k hláseniu pribalí chyby z konzoly prehliadača a verziu aplikácie v okamihu, keď ho používateľ odosiela. Výnimky, traces a release health sledujte v Sentry." },
      { q: "Môžem používať Ozvi a Sentry naraz?", a: "Áno, a tak to robíme aj my. Sentry zachytáva, čo spadne, Ozvi zbiera, čo ľudia hlásia a čo si želajú. Ak k hláseniu v Ozvi existuje issue v Sentry, stačí naň odkázať v poznámke tímu." },
      { q: "Čo potrebujem na vlastný server?", a: "Ozvi beží ako jeden Docker image s Postgresom, so všetkými funkciami zadarmo. Sentry sa na vlastnom serveri spúšťa cez Docker Compose a podľa jeho dokumentácie potrebuje aspoň 4 jadrá, 16 GB RAM, 16 GB swap a 20 GB disku." },
    ],
    sources,
  }),
  en: (f) => ({
    meta: {
      title: "Ozvi vs Sentry: user feedback and error monitoring – Ozvi",
      description: "Sentry catches what crashes in your code. Ozvi catches what people tell you, even when nothing crashed. When to use which, and why they work together.",
    },
    them: "Sentry",
    h1: "Ozvi vs Sentry",
    answer: [
      "Sentry and Ozvi solve different problems. Sentry catches what crashes in your code: exceptions with stack traces, slow requests, session replay. It is a tool for developers, and its User Feedback widget attaches what a user says to that data.",
      "Ozvi catches what people tell you, even when nothing crashed: a wrong total on an invoice, a confusing button, a missing feature. Bug reports stay private, ideas get a public board with voting, a roadmap and a changelog, and the reporter gets an e-mail when their bug is fixed. The two complement each other; we use both ourselves.",
    ],
    table: {
      caption: "Ozvi and Sentry compared by feature",
      rows: [
        { label: "What it is for", ozvi: { text: "Feedback from people: bug reports, ideas, roadmap and changelog" }, them: { text: "Application monitoring: errors and exceptions in code, performance, session replay, logs" } },
        { label: "A bug that throws nothing (a wrong invoice total, a confusing button)", ozvi: { text: "The user reports it through the widget, the team sees it with context", mark: "yes" }, them: { text: "Only if the user sends it through the User Feedback widget; on its own Sentry captures exceptions and performance issues", mark: "partial" } },
        { label: "Exceptions, stack traces, performance and release health", ozvi: { text: "No; it attaches browser console errors to a report, it is not monitoring", mark: "no" }, them: { text: "Sentry's core job, without anyone having to report anything", mark: "yes" } },
        { label: "Session replay", ozvi: { text: "No", mark: "no" }, them: { text: "Yes; a recording of the last seconds before sending can be attached to feedback", mark: "yes" } },
        { label: "User report with a screenshot", ozvi: { text: "Screenshot, app version and console errors; only the reporter and the team see the report", mark: "yes" }, them: { text: "User Feedback widget with a screenshot (not on mobile devices), replay and a link to error context", mark: "yes" } },
        { label: "Handling reports in the team", ozvi: { text: "Statuses, internal notes and tags, merging duplicates, issues in GitHub, Linear and Jira, AI summary (Studio)", mark: "yes" }, them: { text: "A feedback inbox: resolve, mark as spam (also with AI), assign to a teammate, GitHub or Jira issues, AI summary", mark: "yes" } },
        { label: "Reporter learns the bug is fixed", ozvi: { text: "E-mail “fixed in version 2.15, does it work for you?”; answering “not yet” reopens it", mark: "yes" }, them: { text: "The docs describe alerts for the team; they do not mention a message to the person who sent feedback" } },
        { label: "Public board with voting, roadmap, changelog", ozvi: { text: "Yes; voters get an e-mail when you ship the idea", mark: "yes" }, them: { text: "Not part of the product; feedback is meant for the team", mark: "no" } },
        { label: "Sign-in from your app", ozvi: { text: "Signed token (HS256) or OIDC, in every plan including Free", mark: "yes" }, them: { text: "The user types name and e-mail or the SDK passes them; no account needed" } },
        { label: "Price", ozvi: { text: `Free €0, Pro ${f.pro} a year, Studio ${f.studio} a year (excl. VAT)` }, them: { text: "Developer free (5,000 errors, 50 replays a month), Team $26 and Business $80 a month billed yearly" } },
        { label: "Team size", ozvi: { text: "Unlimited in every plan", mark: "yes" }, them: { text: "Developer for 1 user, Team and up unlimited", mark: "partial" } },
        { label: "Self-hosting", ozvi: { text: "One Docker image and Postgres, every feature for €0, source-available (FSL)", mark: "yes" }, them: { text: "Docker Compose, source-available (FSL); at least 4 cores, 16 GB RAM + 16 GB swap and 20 GB disk", mark: "yes" } },
      ],
      note: "Sentry prices in USD as listed on its pricing page, Ozvi prices in euro excluding VAT.",
    },
    pickThem: {
      title: "When to pick Sentry",
      items: [
        "You want to know about exceptions and crashes before anyone reports them, with a stack trace and context.",
        "You track application performance: slow requests, traces and release health.",
        "You need session replay to see what the user did before the error.",
        "You want feedback right next to errors and replays, in one tool for developers.",
      ],
    },
    pickOzvi: {
      title: "When to pick Ozvi",
      items: [
        "You want to hear about problems that throw nothing: a wrong calculation, unclear copy, a missing feature.",
        "Bug reports should stay private between the reporter and the team, and the reporter should learn when the bug is fixed.",
        "You want to collect ideas in public, with voting, a roadmap and a changelog.",
        "Users should sign in through your app, and the board and e-mails should speak Slovak or Czech.",
      ],
    },
    migrate: {
      title: "Using Ozvi and Sentry together",
      text: "You do not have to choose. Sentry watches the code, Ozvi listens to people. Both can run in your app, each doing what it was built for.",
      steps: [
        "Keep Sentry capturing exceptions and performance as before.",
        "Create an Ozvi project on the Free plan, add the widget to your app and connect sign-in with a signed token or OIDC.",
        "Handle reports with no exception behind them in Ozvi; if a Sentry issue exists for a report, link to it in a team note.",
        "When you mark a bug fixed in a version, Ozvi writes to the reporter; when you ship an idea, its voters get an e-mail.",
      ],
    },
    faq: [
      { q: "Isn't Sentry enough?", a: "If you want to know what crashes in your code, Sentry is the right choice and Ozvi will not replace it. But much of what people want to tell you never throws an exception: a wrong calculation, an unclear flow, a missing feature. That is what Ozvi is for." },
      { q: "Doesn't Sentry have a feedback widget too?", a: "It does. The User Feedback widget sends a message with a screenshot (not on mobile) and can attach a session replay and error context. The team resolves it, assigns it or turns it into an issue in Sentry. The docs describe no message back to the person who sent it, and Sentry has no public board with voting, roadmap or changelog. Sentry User Feedback is a debugging tool; Ozvi is a conversation with your customer." },
      { q: "Does Ozvi do error or performance monitoring?", a: "No. The Ozvi widget attaches browser console errors and the app version at the moment the user sends a report. Track exceptions, traces and release health in Sentry." },
      { q: "Can I use Ozvi and Sentry at the same time?", a: "Yes, and that is what we do. Sentry captures what crashes, Ozvi collects what people report and wish for. If a report in Ozvi has a Sentry issue behind it, link to it in a team note." },
      { q: "What do I need to self-host?", a: "Ozvi runs as one Docker image with Postgres, every feature for free. Self-hosted Sentry runs on Docker Compose and, per its docs, needs at least 4 cores, 16 GB RAM, 16 GB swap and 20 GB of disk." },
    ],
    sources,
  }),
};
