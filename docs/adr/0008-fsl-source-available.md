# 0008 — Licencia FSL (source-available) namiesto AGPL

**Stav:** prijaté 2026-11-07, nahrádza licenčnú časť [0001](0001-agpl-all-features-free.md)

**Kontext.** Pri AGPL môže ktokoľvek z nášho kódu spustiť konkurenčný hostovaný Ozvi, stačí zverejniť zmeny. Vlastník zvažoval repo vôbec nezverejniť. Tým by sme ale stratili hlavné argumenty proti Canny a Featurebase: verejný kód, self-host so všetkými funkciami a žiadnu závislosť od jedného dodávateľa.

**Rozhodnutie.** Server (`apps/web`, `packages/db`, `packages/theme`, `packages/mcp`) je pod **Functional Source License 1.1 s budúcou licenciou Apache 2.0** (FSL-1.1-ALv2, ako Sentry). Kód je verejný. Je dovolené ho používať, upravovať a self-hostovať na vlastné aj klientske účely. Nesmie sa ponúkať ako konkurenčná komerčná služba. Každá vydaná verzia sa po dvoch rokoch automaticky stane Apache 2.0. `packages/sdk` a `packages/widget` ostávajú MIT. Zvyšok 0001 platí: self-host má všetky funkcie a cloud predáva pohodlie, nie funkcie.

**Dôsledky.**
- Ozvi sa neoznačuje ako „open source“ (FSL nie je OSI licencia). Píšeme „verejný zdrojový kód“ alebo „source-available“.
- Príspevky prichádzajú pod tou istou licenciou. Budúca licencia Apache 2.0 je udelená neodvolateľne, takže netreba CLA.
- Repo zverejní vlastník (`xzamiska/ozvi` je zatiaľ súkromné).
