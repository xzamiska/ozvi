---
date: 2026-11-24
breaking: false
---
### Pre všetkých
- Widget funguje aj bez prihlásenia cez vašu aplikáciu. Stačí vložiť `<script>`, pridať adresu aplikácie medzi povolené a nechať zapnuté prihlásenie e-mailom. Keď človek odošle hlásenie, nápad alebo hlas, widget sa ho spýta na e-mail a 6-miestny kód, ktorý mu príde. Všetko sa deje priamo vo widgete a napísaný text ostane. Overenie si widget pamätá 30 dní a potom je človek rovnaký ako na boarde: vidí „Moje hlásenia“ a dostane e-mail o oprave. Prihlásenie cez vašu aplikáciu (SSO) ostáva odporúčané, lebo tím vtedy vidí aj meno, plán a MRR.
- Jazyk z webu ozvi.io pokračuje ďalej: kto klikne na „Začať zadarmo“ v angličtine, dostane anglické prihlásenie, konzolu aj e-maily, aj keď má prehliadač po slovensky. Prihlásenie do konzoly má výber jazyka priamo pod formulárom. Fungujú aj adresy `ozvi.io/en/app/login`, `/en/pricing` a `/en/<board>`.
- Pri zmene stavu hlásenia alebo nápadu tím vidí, kto dostane e-mail, môže pridať vlastnú správu (zobrazí sa ako komentár a príde v tom istom e-maile) alebo stav posunúť bez e-mailu.
- Každý člen tímu si v Moje údaje → E-maily pre tím vyberie, čo mu chodí: nové hlásenia, nové nápady, komentáre, pondelňajší súhrn. O hláseniach a diskusiách, v ktorých sa ozval, mu napíšeme vždy. Prepínač „Len pre tím“ pri komentári ostane zapnutý aj po odoslaní.
- Na telefóne sa hlavička boardu pri posúvaní neprilepí a nezaberá miesto. Pod tlačidlom hlasovania vidí neprihlásený návštevník „Prihláste sa“. Náhľad screenshotu vo widgete zaberá najviac štvrtinu obrazovky.
- V nastaveniach sú názvy stavov a predvolieb témy v jazyku, v ktorom správu používate.
- Adresu boardu (napríklad `ozvi.io/vasa-appka`) zmeníte v Nastaveniach → Projekt. Stará adresa po zmene prestane fungovať; formulár pripomenie, kde ju treba prepísať (widget, webhooky, MCP, návrat z prihlásenia).
- Kto prišiel o rolu admina alebo sa medzičasom odhlásil, po uložení nastavení skončí na prihlásení pre adminov, nie na chybovej stránke.

### Pre správcov vlastných serverov
- `OZVI_HEARTBEAT_URL`: Ozvi každú minútu zavolá váš uptime monitor (GlitchTip Heartbeat, Uptime Kuma Push, healthchecks.io), kým odpovedá databáza a e-maily neviaznu vo fronte. Keď údery prestanú, monitor vás upozorní (SELFHOST.md).

### Cloud
- Karta DPA v konzole (Plán a využitie) už neukazuje „Návrh“: zmluva je súčasťou obchodných podmienok, karta odkazuje na jej znenie na ozvi.io/dpa a podpísanú verziu si môžete vyžiadať e-mailom.
