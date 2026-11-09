# 0009 — Vydania na ghcr.io a voliteľný updater

**Stav:** prijaté 2026-11-09

**Kontext.** Vlastné servery (Billiwo, Apinido, neskôr zákazníci) potrebovali spôsob, ako dostať novú verziu bez toho, aby sme im obraz posielali ručne (`docker save | ssh`). Vlastník sa pýtal, či má aktualizovať prevádzkovateľ ručne, alebo to má robiť Ozvi automaticky či na pokyn.

**Rozhodnutie.**
- **Vydanie** spustí tag `vX.Y.Z` s povinnými poznámkami v `apps/web/releases/X.Y.Z.md`. GitHub Actions zostavia obrazy pre `amd64` a `arm64` a nahrajú ich do `ghcr.io` so značkami `X.Y.Z`, `X.Y`, `X` a `latest`. Postup je v [RELEASING](../RELEASING.md).
- **Register je verejný**, rovnako ako repozitár (rozhodnutie vlastníka 2026-11-09, pozri ADR 0008). Prevádzkovatelia preto nepotrebujú žiadne tokeny. Updater vie použiť aj súkromné zrkadlo (`OZVI_REGISTRY_*`).
- **Zoznam vydaní** servíruje ozvi.io na `/releases` a `/releases.json`, z poznámok zabalených v obraze. Updatery sa tak nemusia pýtať GitHubu.
- **Updater je voliteľný kontajner** (`apps/updater`, profil `updater`):
  - Režimy: len upozorniť, na pokyn (predvolený), automaticky v nočnom okne.
  - Riadi `docker compose` v priečinku prevádzkovateľa, takže compose ostáva jediným zdrojom pravdy.
  - Pred každou aktualizáciou zálohuje databázu.
  - Pri nezdravej novej verzii obnoví databázu a spustí predchádzajúci obraz.
  - Automaticky nikdy nenainštaluje novú hlavnú verziu ani vydanie označené ako zásadné.

**Prečo nie Watchtower.** Watchtower nevie zálohovať, nepozná zásadné zmeny a pri zlyhaní migrácie nevie vrátiť databázu.

**Dôsledky.**
- Updater potrebuje Docker socket, teda kontrolu nad serverom. Preto je voliteľný, nemá verejný port a jeho API je chránené zdieľaným tokenom.
- Migrácie idú len dopredu, takže návrat bez obnovenej zálohy nie je možný. Záloha je preto podmienkou každej aktualizácie.
- Self-host má aj s updaterom všetky funkcie. Updater nie je platená funkcia.
