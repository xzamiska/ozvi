# 0012 Dobrovoľná anonymná štatistika z vlastných serverov

**Stav:** prijaté 2026-11-12

**Kontext.** Vlastník chce vedieť, koľko ľudí Ozvi používa nielen v cloude, ale aj na vlastných serveroch. Doteraz sa o self-host inštalácii nedozvedel nič: kontrola verzie je obyčajný GET na `releases.json` a nič sa pri nej nezapisuje. Ozvi stavia na súkromí (widget bez cookies, boardy sa neindexujú), takže tichý zber dát neprichádza do úvahy.

**Rozhodnutie.**
- Štatistika je **opt-in**: posiela sa iba s `OZVI_TELEMETRY=1`, predvolene nič. V cloude ani vo vývojovom builde sa neposiela nikdy.
- Raz denne (prvýkrát 10 minút po štarte) server pošle `POST https://ozvi.io/api/telemetry` s presne siedmimi poľami: jednosmerný hash z `OZVI_SECRET_KEY` (ID inštancie), verzia a päť súčtov (projekty, používatelia, aktívni za 30 dní, záznamy, záznamy za 30 dní). Žiadne mená, e-maily, URL, slugy ani obsah.
- Cloud prijme iba tieto polia (všetko ostatné zahodí), obmedzí počet požiadaviek na IP a drží jeden riadok na inštanciu (`telemetry_instances`) s poslednými počtami. Nie sú to dáta zákazníka, preto tabuľka nemá `project_id` ani RLS.
- Presný zoznam polí je v `docs/SELFHOST.md`; súkromný admin ich ukazuje súhrnne.

**Zamietnuté.** Počítanie inštancií podľa IP adries pri kontrole verzie: nepresné (zdieľané IP, NAT) a robilo by z obyčajného GET sledovanie bez súhlasu.

**Dôsledky.** Čísla zo self-hostu budú podhodnotené (len tí, čo súhlasia). To je cena za to, že sľub „bez vášho súhlasu nič neposielame“ platí doslova.
