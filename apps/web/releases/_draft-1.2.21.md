---
date: 2026-11-24
breaking: false
---
### Pre všetkých
- Adresu boardu (napríklad `ozvi.io/vasa-appka`) zmeníte v Nastaveniach → Projekt. Stará adresa po zmene prestane fungovať; formulár pripomenie, kde ju treba prepísať (widget, webhooky, MCP, návrat z prihlásenia).
- Kto prišiel o rolu admina alebo sa medzičasom odhlásil, po uložení nastavení skončí na prihlásení pre adminov, nie na chybovej stránke.

### Pre správcov vlastných serverov
- `OZVI_HEARTBEAT_URL`: Ozvi každú minútu zavolá váš uptime monitor (GlitchTip Heartbeat, Uptime Kuma Push, healthchecks.io), kým odpovedá databáza a e-maily neviaznu vo fronte. Keď údery prestanú, monitor vás upozorní (SELFHOST.md).

### Cloud
- Karta DPA v konzole (Plán a využitie) už neukazuje „Návrh“: zmluva je súčasťou obchodných podmienok, karta odkazuje na jej znenie na ozvi.io/dpa a podpísanú verziu si môžete vyžiadať e-mailom.
