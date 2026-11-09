# 0001 — AGPL, všetky funkcie v self-hoste

**Stav:** prijaté 2026-11-05; licenciu nahradilo [0008](0008-fsl-source-available.md) (FSL namiesto AGPL), zásada „všetky funkcie v self-hoste“ platí ďalej

**Kontext.** Fider skúsil open-core a vrátil to. Konkurencia (Canny, Featurebase) zamyká SSO a odstránenie brandingu za drahé plány; to je presne to, čo integrátorov hnevá.

**Rozhodnutie.** Celý server AGPL-3.0-only bez feature flagov podľa plánu. `packages/sdk` a `packages/widget` sú MIT, lebo bežia v uzavretých hostiteľských appkách. Cloud predáva pohodlie (hosting, e-maily, domény, zálohy), nie funkcie.

**Dôsledky.** Monetizácia len cez cloud; cena musí byť nízka a hodnota jasná. AGPL bráni konkurenčnému SaaS postavenému na našom kóde bez zdieľania zmien.
