# 0013 Súkromie na screenshote predvolene: zakrytie v kópii stránky

**Stav:** prijaté 2026-11-12

**Kontext.** Screenshot z widgetu doteraz rozmazal (CSS `blur(10px)` na živej stránke) iba polia s heslom a prvky s `data-ozvi-mask`. Všetko ostatné, telefóny, e-maily, mená, hodnoty vo formulároch, bolo na obrázku čitateľné, pokiaľ to vývojár hostiteľskej appky ručne neoznačil. Rozmazanie krátkeho textu sa navyše dá čiastočne odhadnúť a štýl na chvíľu menil stránku, ktorú človek vidí.

**Rozhodnutie.**
- Screenshot sa kreslí z kópie stránky (modern-screenshot `onCloneNode`), ktorú widget najprv upraví; živá stránka sa nemení.
- Zakrýva sa **plným obdĺžnikom** (text priehľadný na podklade, obrázky sa nekreslia), nie rozmazaním: zakryté sa do pixelov nedostane vôbec.
- **Predvolene („auto")**: hodnoty všetkých `input`/`textarea`/`select`/`contenteditable`; v texte e-maily, telefóny (9–15 číslic), IBAN, karty (Luhn), JWT a `Bearer`/`Basic` (spoločné pravidlá `sensitiveRanges` v `@ozvi/sdk/mask`); celé prvky `data-ozvi-mask`.
- **„all"** (`OzviConfig.mask = "all"`): všetok text a obrázky okrem `data-ozvi-unmask`, pre zdravotníctvo, financie a pod.
- Ak maskovanie zlyhá, hlásenie ide **bez** screenshotu, nikdy s nezamaskovaným.

**Zamietnuté.** Ponechať rozmazanie a len rozšíriť zoznam selektorov: rozmazanie nie je spoľahlivé a stále by zaťažovalo integrátora. Maskovanie na serveri: obrázok by už opustil prehliadač.

**Dôsledky.** Mená a voľný text sa podľa tvaru rozpoznať nedajú, `data-ozvi-mask` ostáva potrebný pre ne. Niektoré dlhé čísla (napr. 10-ciferné ID objednávok) sa zakryjú aj keď nie sú citlivé; v prospech súkromia. Kód je v `widget-shot.js`, ktorý sa načíta až pri hlásení, takže úvodný `widget.js` nerastie.
