# 0010 — Boardy sa nikdy neindexujú

**Stav:** prijaté 2026-11-10

**Kontext.** Pred spustením ozvi.io sa vlastník pýtal, či majú projekty vypnuté indexovanie. Na boardoch sú nápady a sťažnosti používateľov zákazníka. Zvažovali sme nastavenie projektu („Zobrazovať vo vyhľadávačoch“).

**Rozhodnutie.**
- **Boardy sa neindexujú nikdy:** na subdoménach, vlastných doménach, na hlavnej doméne ani v self-hoste. **Nie je to nastavenie** a nebude.
- Indexovať sa smú iba vlastné verejné stránky Ozvi v cloude na hlavnej doméne: úvodná stránka vo všetkých jazykoch, dokumentácia, vydania a právne stránky (`lib/indexing.ts`).
- Každá iná odpoveď dostane hlavičku `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` (`proxy.ts`).
- `robots.txt` hostiteľov s boardmi prehľadávanie **nezakazuje**. Vyhľadávač musí stránku stiahnuť, aby hlavičku noindex videl. Zákaz v `robots.txt` by mohol nechať v indexe holú adresu z cudzieho odkazu.
- Staging má navyše basic auth a vlastný `robots.txt` na edge.

**Dôsledky.** Zákazník, ktorý chce verejnú roadmapu vo vyhľadávačoch, ju musí zverejniť na vlastnom webe. Ozvi nebude zdrojom SEO pre zákazníkov.
