import { pageMeta } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalShell } from "@/components/LegalShell";
import { cloudOnly, LEGAL } from "@/lib/legal";

// OZVI_MODE is read at request time (the same image runs self-host and cloud).
export const dynamic = "force-dynamic";

export function generateMetadata() {
  return pageMeta({
    title: "Zmluva o spracúvaní osobných údajov – Ozvi",
    description: "Zmluva o spracúvaní osobných údajov podľa čl. 28 GDPR medzi zákazníkom a Ozvi: predmet, kategórie údajov, opatrenia, subdodávatelia, incidenty a vymazanie.",
    path: "/dpa", locale: "sk",
  });
}

const TOC = [
  { id: "strany", label: "Zmluvné strany" }, { id: "cast-1", label: "Predmet a účel" }, { id: "cast-2", label: "Dotknuté osoby a údaje" },
  { id: "cast-3", label: "Pokyny" }, { id: "cast-4", label: "Mlčanlivosť" }, { id: "cast-5", label: "Opatrenia" },
  { id: "cast-6", label: "Subdodávatelia" }, { id: "cast-7", label: "Prenosy mimo EÚ" }, { id: "cast-8", label: "Pomoc zákazníkovi" },
  { id: "cast-9", label: "Porušenie ochrany" }, { id: "cast-10", label: "Vrátenie a vymazanie" }, { id: "cast-11", label: "Audit" },
  { id: "cast-12", label: "Zodpovednosť" }, { id: "cast-13", label: "Záverečné ustanovenia" },
];

/** The data processing agreement (GDPR art. 28) for the cloud; part of the terms, accepted with them. Source: docs/DPA.md. */
export default function Dpa() {
  if (!cloudOnly()) notFound();
  return (
    <LegalShell title="Zmluva o spracúvaní osobných údajov" toc={TOC}>
      <p>Táto zmluva podľa čl. 28 ods. 3 GDPR je súčasťou <Link href="/terms">obchodných podmienok</Link> služby Ozvi na ozvi.io (ďalej „Podmienky“) a uzatvárate ju ich prijatím. Pri rozpore v otázkach ochrany osobných údajov má prednosť táto zmluva. Ak ju potrebujete podpísanú osobitne, napíšte na <a href={`mailto:${LEGAL.email}?subject=DPA`}>{LEGAL.email}</a>.</p>

      <h2 id="strany">Zmluvné strany</h2>
      <ul>
        <li><b>Prevádzkovateľ</b> (ďalej „Zákazník“): vlastník priestoru v službe Ozvi, teda firma alebo osoba, ktorá službu používa.</li>
        <li><b>Sprostredkovateľ</b> (ďalej „Ozvi“): {LEGAL.operator}, so sídlom {LEGAL.address}, IČO {LEGAL.companyId}, DIČ {LEGAL.taxId}, IČ DPH {LEGAL.vatId}, {LEGAL.register}, kontakt: {LEGAL.email}.</li>
      </ul>

      <h2 id="cast-1">1. Predmet, trvanie, povaha a účel spracúvania</h2>
      <ul>
        <li><b>Predmet:</b> prevádzka boardu spätnej väzby Zákazníka v službe Ozvi: hlásenia chýb, nápady, hlasovanie, komentáre, roadmapa, novinky, widget v aplikácii Zákazníka, e-mailové upozornenia a integrácie, ktoré Zákazník sám zapne.</li>
        <li><b>Trvanie:</b> po dobu používania služby Zákazníkom; po zrušení projektu, priestoru alebo účtu sa postupuje podľa bodu 10.</li>
        <li><b>Povaha:</b> ukladanie, usporiadanie, zobrazenie, prenos (e-maily, integrácie), vyhľadávanie, export a vymazanie; pri zapnutých AI funkciách aj automatizované spracovanie textu (súhrny, návrhy, preklady), ktorého výstup je vždy označený a návrhy schvaľuje človek.</li>
        <li><b>Účel:</b> výlučne poskytovanie služby Zákazníkovi podľa Podmienok. Ozvi údaje nepredáva a nepoužíva na reklamu ani na trénovanie modelov.</li>
      </ul>

      <h2 id="cast-2">2. Dotknuté osoby a kategórie údajov</h2>
      <p><b>Dotknuté osoby:</b> používatelia aplikácie Zákazníka, ktorí na boarde alebo cez widget niečo pošlú, zahlasujú alebo sa prihlásia; členovia tímu Zákazníka; kontakty, ktoré Zákazník importuje alebo pridá cez agenta (MCP).</p>
      <ul>
        <li><b>Identita z aplikácie Zákazníka:</b> identifikátor používateľa, e-mail, meno, avatar, rola.</li>
        <li><b>Údaje o zákazníkoch Zákazníka</b> (vidí len tím): firma, plán, MRR, ak ich Zákazník posiela pri prihlásení.</li>
        <li><b>Obsah spätnej väzby:</b> nápady, hlásenia chýb, komentáre, hlasy, prílohy.</li>
        <li><b>Technický kontext hlásení:</b> adresa stránky, verzia aplikácie, prehliadač, chyby z konzoly, záznam sieťových požiadaviek a krokov, odkazy na záznam relácie, screenshot; maskované v prehliadači aj na serveri.</li>
        <li><b>Prevádzkové údaje:</b> e-mailová fronta a stav doručenia, záznam aktivity, prihlasovacie kódy.</li>
      </ul>
      <p>Služba nie je určená na osobitné kategórie údajov (čl. 9 GDPR) ani na údaje o deťoch. Zákazník zabezpečí, aby ich do služby neposielal (napríklad maskovaním polí atribútom <code>data-ozvi-mask</code>).</p>

      <h2 id="cast-3">3. Pokyny Zákazníka</h2>
      <ul>
        <li>Ozvi spracúva osobné údaje len na základe zdokumentovaných pokynov Zákazníka. Pokynmi sú táto zmluva, Podmienky a nastavenia, ktoré Zákazník urobí v službe (napríklad uchovávanie dát, integrácie, AI funkcie, moderovanie).</li>
        <li>Ak by pokyn podľa Ozvi porušoval GDPR alebo iný predpis, Ozvi na to Zákazníka bez zbytočného odkladu upozorní.</li>
        <li>Ak právo EÚ alebo členského štátu ukladá Ozvi spracúvanie nad rámec pokynov, Ozvi Zákazníka pred spracúvaním informuje, ak to právo nezakazuje.</li>
      </ul>

      <h2 id="cast-4">4. Mlčanlivosť</h2>
      <p>Ozvi zabezpečí, aby sa osoby oprávnené spracúvať osobné údaje zaviazali k mlčanlivosti alebo aby sa na ne vzťahovala zákonná povinnosť mlčanlivosti. Prístup k produkčným dátam má len prevádzkovateľ služby, a to len v rozsahu nevyhnutnom na prevádzku a podporu.</p>

      <h2 id="cast-5">5. Technické a organizačné opatrenia (čl. 32 GDPR)</h2>
      <ul>
        <li><b>Oddelenie dát projektov:</b> každý záznam nesie identifikátor projektu a databáza vynucuje oddelenie na úrovni riadkov (row-level security); aplikácia sa k databáze nepripája ako superpoužívateľ.</li>
        <li><b>Šifrovanie:</b> všetka komunikácia so službou cez HTTPS (TLS); tajné kľúče (SSO, OIDC, integrácie) sú šifrované AES-256-GCM; prístupové tokeny sa ukladajú len ako odtlačky (SHA-256); kópia záloh mimo dátového centra je šifrovaná.</li>
        <li><b>Minimalizácia pri zdroji:</b> widget maskuje citlivé hodnoty (heslá, tokeny, e-maily, IBAN, čísla kariet) ešte v prehliadači a server ich maskuje znova. Hlavičky požiadaviek sa nezaznamenávajú nikdy.</li>
        <li><b>Prístup:</b> hlásenia chýb a ich technický záznam vidí len autor a tím projektu; do integrácií (GitHub, Linear, Jira) a webhookov sa technický záznam neposiela.</li>
        <li><b>Uchovávanie:</b> Zákazník si v nastaveniach projektu volí automatické mazanie technického záznamu hlásení (predvolene po 180 dňoch), príloh uzavretých chýb a neaktívnych importovaných kontaktov; mazanie prebieha každú noc a zapisuje sa do záznamu aktivity.</li>
        <li><b>Odolnosť:</b> denné zálohy uchovávané najviac 30 dní, na samostatnom disku servera a šifrovane mimo dátového centra.</li>
        <li><b>Záznam aktivity:</b> zmeny nastavení, rolí, tokenov a integrácií sa zapisujú do záznamu aktivity priestoru.</li>
        <li><b>Ochrana proti zneužitiu:</b> obmedzenie počtu požiadaviek, moderovanie, blokovanie používateľov.</li>
      </ul>
      <p>Ozvi môže opatrenia meniť, ak tým neznižuje úroveň ochrany.</p>

      <h2 id="cast-6">6. Ďalší sprostredkovatelia (subdodávatelia)</h2>
      <ul>
        <li>Zákazník udeľuje Ozvi všeobecné písomné povolenie zapojiť ďalších sprostredkovateľov. Aktuálny zoznam je na <Link href="/subprocessors">ozvi.io/subprocessors</Link> a je súčasťou tejto zmluvy.</li>
        <li>Ozvi Zákazníka upozorní e-mailom na zamýšľané pridanie alebo výmenu ďalšieho sprostredkovateľa aspoň 30 dní vopred. Zákazník môže z oprávnených dôvodov ochrany údajov namietať; ak sa strany nedohodnú, môže službu vypovedať s okamžitou účinnosťou a Ozvi mu vráti pomernú časť predplatného za nevyčerpané obdobie.</li>
        <li>Ozvi uloží každému ďalšiemu sprostredkovateľovi zmluvou rovnaké povinnosti ochrany údajov, aké má podľa tejto zmluvy, a za jeho plnenie zodpovedá Zákazníkovi.</li>
        <li>Integrácie, ktoré Zákazník pripojí vlastným účtom (GitHub, Linear, Jira, webhooky, chatové kanály), sú príjemcami na pokyn Zákazníka; ich výber a zmluvný vzťah s nimi je vecou Zákazníka.</li>
      </ul>

      <h2 id="cast-7">7. Prenosy mimo EÚ/EHP</h2>
      <p>Údaje sa ukladajú na serveri v dátovom centre Hetzner v Nemecku (EÚ). Prenos do tretej krajiny nastáva len cez ďalších sprostredkovateľov podľa bodu 6, a to na základe rozhodnutia o primeranosti (vrátane rámca EÚ – USA pre ochranu údajov) alebo štandardných zmluvných doložiek; mechanizmus pri každom z nich je uvedený v zozname subdodávateľov.</p>

      <h2 id="cast-8">8. Pomoc Zákazníkovi</h2>
      <ul>
        <li><b>Práva dotknutých osôb:</b> služba umožňuje každému používateľovi stiahnuť svoje údaje a zmazať ich (Moje údaje na boarde) a Zákazníkovi exportovať a zmazať celý projekt. Ak Ozvi dostane žiadosť dotknutej osoby priamo, postúpi ju bez zbytočného odkladu Zákazníkovi a sama na ňu neodpovie, ak ju Zákazník nepoverí.</li>
        <li><b>Bezpečnosť, posúdenie vplyvu, predchádzajúca konzultácia:</b> Ozvi poskytne Zákazníkovi informácie, ktoré má k dispozícii, potrebné na plnenie povinností podľa čl. 32 až 36 GDPR.</li>
      </ul>

      <h2 id="cast-9">9. Porušenie ochrany osobných údajov</h2>
      <p>Ozvi oznámi Zákazníkovi porušenie ochrany osobných údajov, ktoré sa týka jeho údajov, bez zbytočného odkladu, najneskôr do 48 hodín od jeho zistenia, na e-mail vlastníka priestoru. Oznámenie obsahuje, nakoľko je to v tom čase známe: povahu porušenia, kategórie a približný počet dotknutých osôb a záznamov, pravdepodobné následky, prijaté a navrhované opatrenia a kontakt na osobu, ktorá poskytne ďalšie informácie. Chýbajúce informácie Ozvi doplní postupne.</p>

      <h2 id="cast-10">10. Vrátenie a vymazanie údajov</h2>
      <ul>
        <li>Zákazník si môže kedykoľvek stiahnuť export projektu (JSON a CSV) v nastaveniach projektu.</li>
        <li>Po zmazaní projektu alebo priestoru Zákazníkom Ozvi vymaže jeho dáta z databázy a úložiska príloh okamžite; zo záloh zmiznú najneskôr do 30 dní.</li>
        <li>Po zrušení účtu alebo ukončení služby Ozvi vymaže zostávajúce dáta Zákazníka do 30 dní, ak právo EÚ alebo členského štátu nevyžaduje ich ďalšie uchovanie.</li>
      </ul>

      <h2 id="cast-11">11. Preukázanie súladu a audit</h2>
      <ul>
        <li>Ozvi poskytne Zákazníkovi na požiadanie informácie potrebné na preukázanie splnenia povinností podľa čl. 28 GDPR (najmä túto zmluvu, opis opatrení a zoznam subdodávateľov).</li>
        <li>Zákazník alebo ním poverený audítor viazaný mlčanlivosťou môže vykonať audit, s oznámením aspoň 30 dní vopred a najviac raz za 12 mesiacov, ak nejde o podozrenie z porušenia. Audit prebieha prednostne písomne (dotazník a podklady); audit na mieste ide na náklady Zákazníka a nesmie ohroziť dáta iných zákazníkov.</li>
      </ul>

      <h2 id="cast-12">12. Zodpovednosť</h2>
      <p>Zodpovednosť voči dotknutým osobám sa riadi čl. 82 GDPR. Medzi stranami platí obmedzenie zodpovednosti podľa Podmienok, s výnimkou škody spôsobenej úmyselne alebo z hrubej nedbanlivosti.</p>

      <h2 id="cast-13">13. Záverečné ustanovenia</h2>
      <ul>
        <li>Zmluva je účinná prijatím Podmienok (pri prihlásení do služby) a trvá, kým Ozvi spracúva osobné údaje Zákazníka.</li>
        <li>Zmluva sa riadi právom Slovenskej republiky. Zmeny Ozvi oznámi e-mailom aspoň 30 dní vopred; zmenu zoznamu subdodávateľov upravuje bod 6.</li>
        <li>Ak by niektoré ustanovenie bolo neplatné, ostatné zostávajú v platnosti.</li>
      </ul>
    </LegalShell>
  );
}
