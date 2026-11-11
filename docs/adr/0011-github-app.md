# 0011 — GitHub cez GitHub App

**Stav:** prijaté 2026-11-11

**Kontext.** GitHub sa pripájal fine-grained tokenom a webhookom, ktorý si admin pridal v repozitári ručne: vlastník repozitára, oprávnenia, URL, secret. Vlastník to označil za zbytočne ťažké a pýtal sa, či sa to nedá vyriešiť bez ručného zadávania repozitára a tokenu.

**Rozhodnutie.**
- Inštancia Ozvi má **jednu GitHub App** (`OZVI_GITHUB_APP_*`). Admin klikne na Pripojiť GitHub, na GitHube appku nainštaluje na repozitáre, ktoré zvolí, a v Ozvi vyberie jeden zo zoznamu. Netreba žiadny token ani webhook. Tokeny inštalácie si Ozvi vydá samo (`lib/github-app.ts`) a drží ich iba v pamäti.
- **Overenie inštalácie.** Callback z GitHubu prichádza na hlavnú adresu, nie na adresu boardu. Preto:
  - board podpíše `state` (projekt, admin, 30 minút);
  - callback cez OAuth pri inštalácii overí, že ten, kto inštaloval, inštaláciu naozaj vidí;
  - až potom odovzdá boardu lístok na 5 minút a board ho uloží pod session admina.
  - Bez tohto overenia by si ktokoľvek mohol pripojiť cudziu inštaláciu a zakladať issues v cudzích repozitároch.
- **Jeden webhook appky pre všetky boardy.**
  - Číslo inštalácie je na riadku `projects` (`github_installation_id`). `projects` nemá RLS (ADR-0004), takže hľadanie boardov nepotrebuje `withSystem`.
  - Každý board udalosť spracuje vo svojom `withProject`, iba pre svoj repozitár.
  - Odinštalovanie alebo pozastavenie appky na GitHube boardy odpojí.
- **Token zostáva ako záloha.** Bez nastavenej appky (self-host, ktorý si appku nevytvoril) funguje pôvodné pripojenie tokenom a webhookom pre každý projekt. Self-host má všetky funkcie: `scripts/create-github-app.mjs` vytvorí vlastnú appku cez manifest na GitHube jedným potvrdením.

**Dôsledky.**
- Cloud aj staging potrebujú každý vlastnú appku (webhook a callback smerujú na ich adresu).
- Oprávnenia appky: Issues zápis; Pull requests, Contents a Metadata čítanie. Udalosti: issues, pull_request, release.
- Linear a Jira zostávajú pri tokenoch.
