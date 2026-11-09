# Zmluva o spracúvaní osobných údajov (DPA) — Ozvi cloud

> **NÁVRH NA PRÁVNU KONTROLU.** Toto je pracovná šablóna podľa čl. 28 ods. 3 GDPR, nie hotový právny text. Pred prvým podpisom ju musí skontrolovať právnik (najmä zodpovednosť, audit, prenosy mimo EÚ a lehoty). Platí len pre hostovanú službu (cloud); vlastná inštalácia (self-host) má vlastného prevádzkovateľa a túto zmluvu nepotrebuje.
>
> Zástupné údaje `{{…}}` sa vypĺňajú z `apps/web/src/lib/legal.ts` (`LEGAL`). Hranaté zátvorky `[…]` dopĺňa prevádzkovateľ alebo zákazník pri podpise. Body označené **TODO** treba pred použitím overiť.

Verzia šablóny: {{LEGAL.version}} · účinná od {{LEGAL.effective}}

## Zmluvné strany

**Prevádzkovateľ** (zákazník, ďalej „Zákazník“):
[obchodné meno], IČO [IČO], so sídlom [sídlo], zastúpený [meno, funkcia], kontakt pre ochranu údajov: [e-mail].

**Sprostredkovateľ** (poskytovateľ služby Ozvi, ďalej „Ozvi“):
{{LEGAL.operator}}, IČO {{LEGAL.companyId}}, so sídlom {{LEGAL.address}}, kontakt: {{LEGAL.email}}.

Táto zmluva dopĺňa [Obchodné podmienky](https://ozvi.io/terms) (ďalej „Podmienky“). Pri rozpore v otázkach ochrany osobných údajov má prednosť táto zmluva.

## 1. Predmet, trvanie, povaha a účel spracúvania

1.1 **Predmet:** prevádzka boardu spätnej väzby Zákazníka v službe Ozvi: hlásenia chýb, nápady, hlasovanie, komentáre, roadmapa, novinky, widget v aplikácii Zákazníka, e-mailové upozornenia a integrácie, ktoré Zákazník sám zapne.

1.2 **Trvanie:** po dobu používania služby Zákazníkom. Po zrušení projektu alebo účtu postupuje Ozvi podľa bodu 10.

1.3 **Povaha:** ukladanie, usporiadanie, zobrazenie, prenos (e-maily, integrácie), vyhľadávanie, export a vymazanie; pri zapnutých AI funkciách aj automatizované spracovanie textu (súhrny, návrhy, preklady), ktorého výstup je vždy len návrh na schválenie človekom.

1.4 **Účel:** výlučne poskytovanie služby Zákazníkovi podľa Podmienok. Ozvi nepoužíva údaje na reklamu, nepredáva ich a nepoužíva ich na trénovanie modelov.

## 2. Kategórie dotknutých osôb a osobných údajov

2.1 **Dotknuté osoby:** používatelia aplikácie Zákazníka, ktorí na boarde alebo cez widget niečo pošlú, zahlasujú alebo sa prihlásia; členovia tímu Zákazníka; kontakty, ktoré Zákazník importuje alebo pridá cez agenta (MCP).

2.2 **Kategórie údajov:**

| Kategória | Príklady |
|---|---|
| Identita z aplikácie Zákazníka | identifikátor používateľa, e-mail, meno, avatar, rola |
| Údaje o zákazníkovi (len pre tím) | firma, plán, MRR, ak ich Zákazník posiela cez SSO |
| Obsah spätnej väzby | nápady, hlásenia chýb, komentáre, hlasy, prílohy |
| Technický kontext hlásení | adresa stránky, verzia aplikácie, prehliadač, chyby z konzoly, záznam sieťových požiadaviek a krokov, odkazy na záznam relácie, screenshot; maskované v prehliadači aj na serveri |
| Prevádzkové údaje | e-mailová fronta a stav doručenia, záznam aktivity v nastaveniach, prihlasovacie kódy |

2.3 Služba nie je určená na osobitné kategórie údajov (čl. 9 GDPR) ani údaje o deťoch. Zákazník zabezpečí, aby ich do služby neposielal (napr. maskovaním polí atribútom `data-ozvi-mask`).

## 3. Pokyny Zákazníka

3.1 Ozvi spracúva osobné údaje len na základe zdokumentovaných pokynov Zákazníka. Pokynmi sú táto zmluva, Podmienky a nastavenia, ktoré Zákazník urobí v službe (napr. uchovávanie dát, integrácie, AI funkcie, moderovanie).

3.2 Ak by pokyn podľa Ozvi porušoval GDPR alebo iný predpis, Ozvi na to Zákazníka bez zbytočného odkladu upozorní.

3.3 Ak právo EÚ alebo členského štátu ukladá Ozvi spracúvanie nad rámec pokynov, Ozvi Zákazníka pred spracúvaním informuje, ak to právo nezakazuje.

## 4. Mlčanlivosť

Ozvi zabezpečí, aby sa osoby oprávnené spracúvať osobné údaje zaviazali k mlčanlivosti alebo aby sa na ne vzťahovala zákonná povinnosť mlčanlivosti. Prístup k produkčným dátam má len [počet / role] osôb a len v rozsahu nevyhnutnom na prevádzku a podporu.

## 5. Technické a organizačné opatrenia (čl. 32 GDPR)

Ozvi prijíma najmä tieto opatrenia (úplný a aktuálny opis: **TODO** príloha s TOM po kontrole infraštruktúry):

- **Oddelenie dát projektov:** každý záznam nesie identifikátor projektu a databáza vynucuje oddelenie na úrovni riadkov (row-level security); aplikácia sa k databáze nepripája ako superpoužívateľ.
- **Šifrovanie tajomstiev:** tajné kľúče (SSO, OIDC, integrácie) sú šifrované AES-256-GCM; prístupové tokeny sa ukladajú len ako odtlačky (SHA-256).
- **Šifrovanie pri prenose:** všetka komunikácia so službou cez HTTPS (TLS). **TODO:** šifrovanie diskov a záloh v pokoji.
- **Minimalizácia pri zdroji:** widget maskuje citlivé hodnoty (heslá, tokeny, e-maily, IBAN, čísla kariet) ešte v prehliadači; server ich maskuje znova. Hlavičky požiadaviek sa nezaznamenávajú nikdy.
- **Prístup:** hlásenia chýb a ich technický záznam vidí len autor a tím projektu; do integrácií (GitHub, Linear, Jira) a webhookov sa technický záznam neposiela.
- **Uchovávanie:** Zákazník si v nastaveniach projektu volí automatické mazanie technického záznamu hlásení (predvolene po 180 dňoch), príloh uzavretých chýb a neaktívnych importovaných kontaktov; mazanie prebieha každú noc a zapisuje sa do záznamu aktivity.
- **Odolnosť:** denné zálohy (**TODO:** miesto uloženia, doba uchovania záloh, test obnovy).
- **Záznam aktivity:** zmeny nastavení, rolí, tokenov a integrácií sa zapisujú do záznamu aktivity priestoru.
- **Ochrana proti zneužitiu:** obmedzenie počtu požiadaviek, moderovanie, blokovanie používateľov.

Ozvi môže opatrenia meniť, ak tým neznižuje úroveň ochrany.

## 6. Ďalší sprostredkovatelia (subdodávatelia)

6.1 Zákazník udeľuje Ozvi všeobecné písomné povolenie zapojiť ďalších sprostredkovateľov. Aktuálny zoznam je zverejnený na [ozvi.io/subprocessors](https://ozvi.io/subprocessors) a je súčasťou tejto zmluvy.

6.2 Ozvi Zákazníka upozorní e-mailom na zamýšľané pridanie alebo výmenu ďalšieho sprostredkovateľa aspoň **[N] dní** vopred. Zákazník môže z oprávnených dôvodov ochrany údajov namietať; ak sa strany nedohodnú, Zákazník môže službu vypovedať s okamžitou účinnosťou a Ozvi mu vráti pomernú časť predplatného za nevyčerpané obdobie.

6.3 Ozvi uloží každému ďalšiemu sprostredkovateľovi zmluvou rovnaké povinnosti ochrany údajov, aké má podľa tejto zmluvy, a za jeho plnenie zodpovedá Zákazníkovi.

6.4 Integrácie, ktoré Zákazník pripojí vlastným účtom (GitHub, Linear, Jira, webhooky, chatové kanály), sú príjemcami na pokyn Zákazníka. Ich výber a zmluvný vzťah s nimi je vecou Zákazníka.

## 7. Prenosy mimo EÚ/EHP

Údaje sa ukladajú na serveri v Slovenskej republike. Prenos do tretej krajiny nastáva len cez ďalších sprostredkovateľov uvedených v zozname podľa bodu 6.1, a to na základe rozhodnutia o primeranosti (vrátane rámca EÚ – USA pre ochranu údajov) alebo štandardných zmluvných doložiek. **TODO:** doplniť mechanizmus pri každom subdodávateľovi (stránka /subprocessors má zatiaľ tieto polia neoverené).

## 8. Pomoc Zákazníkovi

8.1 **Práva dotknutých osôb:** služba umožňuje každému používateľovi stiahnuť svoje údaje a zmazať ich (Moje údaje na boarde) a Zákazníkovi exportovať a zmazať celý projekt. Ak Ozvi dostane žiadosť dotknutej osoby priamo, postúpi ju bez zbytočného odkladu Zákazníkovi a sama na ňu neodpovie, ak ju Zákazník nepoverí.

8.2 **Bezpečnosť, posúdenie vplyvu, predchádzajúca konzultácia:** Ozvi poskytne Zákazníkovi informácie, ktoré má k dispozícii, potrebné na plnenie povinností podľa čl. 32 až 36 GDPR.

## 9. Porušenie ochrany osobných údajov

9.1 Ozvi oznámi Zákazníkovi porušenie ochrany osobných údajov, ktoré sa týka jeho údajov, bez zbytočného odkladu, najneskôr do **48 hodín** od jeho zistenia, na kontakt uvedený v zmluvných stranách.

9.2 Oznámenie obsahuje, nakoľko je to v tom čase známe: povahu porušenia, kategórie a približný počet dotknutých osôb a záznamov, pravdepodobné následky, prijaté a navrhované opatrenia a kontakt na osobu, ktorá poskytne ďalšie informácie. Chýbajúce informácie Ozvi doplní postupne.

## 10. Vrátenie a vymazanie údajov

10.1 Zákazník si môže kedykoľvek stiahnuť export projektu (JSON a CSV) v nastaveniach projektu.

10.2 Po zmazaní projektu Zákazníkom Ozvi vymaže jeho dáta z databázy a úložiska príloh okamžite. Zo záloh zmiznú najneskôr po uplynutí doby uchovania záloh (**TODO:** [N] dní).

10.3 Po zrušení účtu alebo ukončení služby Ozvi vymaže zostávajúce dáta Zákazníka do **[N] dní**, ak právo EÚ alebo členského štátu nevyžaduje ich ďalšie uchovanie.

## 11. Preukázanie súladu a audit

11.1 Ozvi poskytne Zákazníkovi na požiadanie informácie potrebné na preukázanie splnenia povinností podľa čl. 28 GDPR (najmä túto zmluvu, opis opatrení a zoznam subdodávateľov).

11.2 Zákazník alebo ním poverený audítor viazaný mlčanlivosťou môže vykonať audit vrátane kontroly, s oznámením aspoň **[N] dní** vopred, najviac raz za 12 mesiacov, ak nejde o podozrenie z porušenia. **TODO:** náklady auditu a forma (dotazník / na mieste) po právnej kontrole.

## 12. Zodpovednosť

Zodpovednosť strán sa riadi čl. 82 GDPR a Podmienkami. **TODO:** zosúladiť s obmedzením zodpovednosti v Podmienkach (bod 8) po právnej kontrole.

## 13. Záverečné ustanovenia

13.1 Zmluva je účinná dňom podpisu oboma stranami (alebo elektronickým prijatím v službe) a trvá, kým Ozvi spracúva osobné údaje Zákazníka.

13.2 Zmluva sa riadi právom Slovenskej republiky. Na zmeny je potrebná písomná forma; zmenu zoznamu subdodávateľov upravuje bod 6.

13.3 Ak by niektoré ustanovenie bolo neplatné, ostatné zostávajú v platnosti.

---

| Za Zákazníka | Za Ozvi |
|---|---|
| Meno, funkcia: [ ] | Meno, funkcia: [ ] |
| Dátum: [ ] | Dátum: [ ] |
| Podpis: | Podpis: |
