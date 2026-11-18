---
date: 2026-11-24
breaking: false
---
### Pre všetkých
- Widget funguje aj bez prihlásenia cez vašu aplikáciu. Stačí vložiť `<script>`, pridať adresu aplikácie medzi povolené a nechať zapnuté prihlásenie e-mailom. Keď človek odošle hlásenie, nápad alebo hlas, widget sa ho spýta na e-mail a 6-miestny kód, ktorý mu príde. Všetko sa deje priamo vo widgete a napísaný text ostane. Overenie si widget pamätá 30 dní a potom je človek rovnaký ako na boarde: vidí „Moje hlásenia“ a dostane e-mail o oprave. Prihlásenie cez vašu aplikáciu (SSO) ostáva odporúčané, lebo tím vtedy vidí aj meno, plán a MRR.
- Adresu boardu (napríklad `ozvi.io/vasa-appka`) zmeníte v Nastaveniach → Projekt. Stará adresa po zmene prestane fungovať; formulár pripomenie, kde ju treba prepísať (widget, webhooky, MCP, návrat z prihlásenia).
- Kto prišiel o rolu admina alebo sa medzičasom odhlásil, po uložení nastavení skončí na prihlásení pre adminov, nie na chybovej stránke.

### Pre správcov vlastných serverov
- `OZVI_HEARTBEAT_URL`: Ozvi každú minútu zavolá váš uptime monitor (GlitchTip Heartbeat, Uptime Kuma Push, healthchecks.io), kým odpovedá databáza a e-maily neviaznu vo fronte. Keď údery prestanú, monitor vás upozorní (SELFHOST.md).

### Cloud
- Karta DPA v konzole (Plán a využitie) už neukazuje „Návrh“: zmluva je súčasťou obchodných podmienok, karta odkazuje na jej znenie na ozvi.io/dpa a podpísanú verziu si môžete vyžiadať e-mailom.
