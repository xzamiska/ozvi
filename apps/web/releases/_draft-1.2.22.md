---
date: 2026-12-08
breaking: false
---
### Pre všetkých
- AI preklady aj mimo detailu príspevku. V automatickom režime sa prekladajú aj názvy v zoznamoch nápadov a chýb a v nápadoch vo widgete, s označením „preložené s pomocou AI“ a prepínačom späť na originály. Odpoveď tímu dostane zákazník v e-maile v svojom jazyku, s originálom pod prekladom. Funguje to v režime „Na požiadanie“ aj „Automaticky“. Súkromné hlásenia sa prekladajú len reportérovi a tímu, každý preklad sa počíta do mesačného počtu prekladov plánu a e-mail nikdy nečaká: keď preklad nevyjde, odíde originál.
- Nové boardy na plánoch Pro a Studio (a pri vlastnom hostingu s nastaveným AI) majú preklad príspevkov rovno zapnutý v režime „Na požiadanie“. Existujúcim boardom sa nastavenie nemení.
- Tímové e-maily môžu chodiť v súhrne. V „Moje údaje → E-maily pre tím“ si každý člen tímu vyberie: hneď, súhrn raz za hodinu, alebo súhrn raz denne o 8:00. Súhrn obsahuje nové hlásenia a nápady, komentáre, zmeny stavu a pridelenia. Zákazníkom chodí všetko ako doteraz. Do limitu e-mailov sa súhrn počíta ako jeden e-mail.
- Aktivita v konzole zaznamenáva aj zverejnenie novinky (aj cez MCP) s počtom rozoslaných e-mailov, zmazanie konceptu novinky, každý export dát (CSV aj celý JSON) a zmazanie projektu. Vždy je pri tom vidieť, kto to urobil.
- Podobné nápady sa dajú hľadať aj podľa významu, nielen podľa slov: „Stiahnuť faktúry ako tabuľku“ nájde „Export faktúr do CSV“. Malý model beží priamo na serveri Ozvi, text nikam neodchádza a nič sa neplatí za volanie, preto nie je viazaný na plán s AI. Návrhy sú označené ako vybrané AI modelom; o zlúčení vždy rozhoduje človek.

### Pre správcov vlastných serverov
- Lokálny model na podobnosť podľa významu: `OZVI_EMBEDDINGS=local` (multilingual-e5-small, beží v Ozvi cez WebAssembly, aj na Alpine). Pri prvom použití stiahne model (~135 MB) z Hugging Face do `OZVI_MODELS_DIR` (predvolene `models` vedľa príloh, v Dockeri `/data/models`); `OZVI_MODELS_PREFETCH=1` ho stiahne a načíta hneď pri štarte. Beží vo vlastnom procese vedľa servera, takže nespomaľuje požiadavky. Kým je načítaný, potrebuje približne 1,1 GB RAM navyše; `OZVI_EMBEDDINGS_IDLE_MINUTES=15` ho po 15 minútach nečinnosti ukončí a pamäť vráti systému. `OZVI_EMBEDDINGS_THREADS` (predvolene 1) zrýchli dlhšie texty na viacjadrovom serveri. Pri zmene modelu sa záznamy zaindexujú znova samé.
- `node ozvi.mjs duplicates:eval --project <slug>` zmeria na zlúčených záznamoch, ako dobre jednotlivé metódy (text, API, lokálny model) nájdu originál. Vypíše len čísla, nikdy texty.
