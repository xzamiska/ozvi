# 0002 — Jeden image, dva režimy

**Stav:** prijaté 2026-11-05

**Rozhodnutie.** Ten istý Docker image pre self-host aj cloud. `OZVI_MODE=cloud` zapína billing (Creem), ozvi.io subdomény, Ozvi účty (e-mail kód + magic link) a správu workspace-ov. Self-host = jeden workspace, prihlásenie cez hostiteľskú appku.

**Dôsledky.** Cloud nemôže mať „tajné“ funkcie; čo testujeme v cloude, testujeme aj pre self-host. Kód špecifický pre cloud sa drží za jedným prepínačom, nie roztrúsený.
