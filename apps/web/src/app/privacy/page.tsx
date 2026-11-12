import { pageMeta } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalShell } from "@/components/LegalShell";
import { cloudOnly, LEGAL } from "@/lib/legal";

// OZVI_MODE is read at request time (the same image runs self-host and cloud).
export const dynamic = "force-dynamic";
// The text is Slovak only, so is its metadata.
export async function generateMetadata() {
  const s = await getTranslations({ locale: "sk", namespace: "seo" });
  return pageMeta({ title: "Ochrana súkromia – Ozvi", description: s("privacyDescription"), path: "/privacy", locale: "sk" });
}

const TOC = [
  { id: "cast-1", label: "Kto sme" }, { id: "cast-2", label: "Váš účet v Ozvi" }, { id: "cast-3", label: "Platby" }, { id: "cast-4", label: "Keď nám napíšete" },
  { id: "cast-5", label: "Prevádzka a bezpečnosť" }, { id: "cast-6", label: "Návštevnosť" }, { id: "cast-7", label: "Dáta na boardoch" },
  { id: "cast-8", label: "Komu údaje posielame" }, { id: "cast-9", label: "Cookies" }, { id: "cast-10", label: "Vlastné servery" },
  { id: "cast-11", label: "Vaše práva" }, { id: "cast-12", label: "Bezpečnosť" }, { id: "cast-13", label: "Zmluva o spracúvaní a zmeny" },
];

export default function Privacy() {
  // Self-hosted instances have their own operator and privacy notice.
  if (!cloudOnly()) notFound();
  return (
    <LegalShell title="Ochrana súkromia" toc={TOC}>
      <p>Ozvi spracúva osobné údaje v dvoch rolách. Pri vašom účte v Ozvi sme prevádzkovateľ. Pri dátach na boardoch, ktoré prevádzkujú naši zákazníci, sme ich sprostredkovateľ. Tu je, čo spracúvame, prečo, na akom právnom základe, komu to posielame a ako dlho to držíme.</p>

      <h2 id="cast-1">1. Kto sme</h2>
      <p>Prevádzkovateľ: {LEGAL.operator}, so sídlom {LEGAL.address}, IČO {LEGAL.companyId}, {LEGAL.register}. Vo všetkých otázkach ochrany údajov nám píšte na <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Zodpovednú osobu sme neurčili, zákon nám to neukladá.</p>

      <h2 id="cast-2">2. Váš účet v Ozvi</h2>
      <ul>
        <li><b>Čo:</b> e-mail, meno (ak ho vyplníte), členstvo a rola v priestoroch, čas posledného prihlásenia, záznam aktivity v priestore (kto čo zmenil).</li>
        <li><b>Prečo a na akom základe:</b> aby ste sa mohli prihlásiť a spravovať projekty a tím. Je to plnenie zmluvy (čl. 6 ods. 1 písm. b GDPR). Bez e-mailu účet založiť nejde.</li>
        <li><b>Ako dlho:</b> kým účet nezrušíte. Prihlasovacie kódy a odkazy mažeme do 1 dňa, pozvánky po 7 dňoch.</li>
      </ul>

      <h2 id="cast-3">3. Platby</h2>
      <p>Platené plány predáva Creem (Armitage Labs OÜ, Estónsko) ako samostatný predajca a pri platbe je samostatným prevádzkovateľom; platí jeho <a href="https://www.creem.io/privacy" target="_blank" rel="noopener">ochrana súkromia</a>. My od Creem dostaneme a uložíme len identifikátory zákazníka a predplatného, plán, stav a obdobie predplatného. Kartu ani fakturačné údaje nevidíme. Základ: plnenie zmluvy. Údaje držíme, kým trvá priestor.</p>

      <h2 id="cast-4">4. Keď nám napíšete</h2>
      <p>E-maily na adresy @ozvi.io prijíma Migadu (Švajčiarsko). Ich obsah a vašu adresu použijeme na to, aby sme vám odpovedali a vybavili vašu žiadosť; základom je plnenie zmluvy alebo náš oprávnený záujem odpovedať vám. Korešpondenciu držíme, kým je potrebná, najviac 3 roky od vybavenia.</p>

      <h2 id="cast-5">5. Prevádzka a bezpečnosť</h2>
      <ul>
        <li><b>IP adresy:</b> prístupové logy s IP adresami nevedieme. IP adresu držíme len krátko v pamäti servera, aby sme obmedzili počet pokusov (napríklad pri prihlasovaní) a odrazili zneužitie.</li>
        <li><b>Chyby servera</b> zaznamenávame vo vlastnom nástroji GlitchTip na našom serveri v EÚ: typ chyby, technický popis a adresu stránky bez parametrov. Hlavičky, cookies ani obsah požiadaviek sa nezaznamenávajú; popis chyby môže výnimočne obsahovať časť údajov, s ktorými aplikácia práve pracovala. Záznamy mažeme po 90 dňoch.</li>
        <li><b>Zálohy</b> robíme denne a držíme najviac 30 dní; kópia mimo dátového centra je šifrovaná. Údaje zmazané v službe zo záloh zmiznú do 30 dní.</li>
        <li><b>Základ:</b> náš oprávnený záujem na bezpečnej a dostupnej službe (čl. 6 ods. 1 písm. f GDPR).</li>
      </ul>

      <h2 id="cast-6">6. Návštevnosť verejných stránok</h2>
      <p>Návštevnosť verejných stránok Ozvi (úvodná stránka, dokumentácia, cenník) počítame na našom serveri nástrojom Umami, ktorý prevádzkujeme sami v EÚ. Zaznamená sa adresa stránky (bez parametrov), odkiaľ ste prišli, jazyk a typ prehliadača; IP adresu Umami použije len na odhad krajiny a na denne sa meniaci anonymný odtlačok, neukladá ju. Nič sa neukladá vo vašom zariadení ani z neho nečíta. Ak má prehliadač zapnuté „nesledovať“ (Do Not Track alebo Global Privacy Control), nezaznamenáme nič. Boardy, konzolu ani widget nesledujeme. Právny základ: oprávnený záujem na tom, aby sme vedeli, ktoré stránky ľudia čítajú.</p>

      <h2 id="cast-7">7. Dáta na boardoch: sme sprostredkovateľ</h2>
      <p>Nápady, hlásenia chýb, komentáre, hlasy, prílohy a technický kontext hlásení (prehliadač, adresa stránky, screenshot) patria zákazníkovi, ktorý board prevádzkuje. My ich spracúvame len podľa jeho pokynov a na základe <Link href="/dpa">zmluvy o spracúvaní</Link>. Ak ste používateľ niektorej aplikácie a máte otázku k svojim údajom, obráťte sa na jej prevádzkovateľa.</p>
      <ul>
        <li>Každý používateľ si na boarde v časti <b>Moje údaje</b> môže stiahnuť svoje dáta alebo ich zmazať.</li>
        <li>Citlivé polia na screenshotoch sa maskujú už v prehliadači, pred odoslaním.</li>
        <li>Hlásenia chýb vidí len ten, kto ich poslal, a tím projektu.</li>
        <li>Ako dlho sa dáta držia, určuje zákazník v nastaveniach projektu (Dáta projektu → Uchovávanie dát): technický záznam z hlásení chýb vrátane screenshotu sa predvolene maže po 180 dňoch, prílohy uzavretých chýb a kontakty z importu, ktoré sa nikdy neprihlásili, podľa jeho voľby. Ostatné držíme, kým ich zákazník nezmaže alebo nezruší projekt.</li>
      </ul>
      <h3 id="hlasenie-chyby">Čo zachytí hlásenie chyby z widgetu</h3>
      <p>Widget si v pamäti prehliadača drží krátky záznam, aby tím vedel chybu zopakovať. Zo stránky odíde len vtedy, keď používateľ hlásenie odošle, a ten ho môže pred odoslaním vypnúť. Všetko sa maskuje ešte v prehliadači, pred uložením do záznamu, a server to maskuje znova.</p>
      <ul>
        <li><b>Stránka a prostredie:</b> adresa stránky, verzia aplikácie, prehliadač, veľkosť okna, jazyk, posledné chyby z konzoly.</li>
        <li><b>Screenshot:</b> bez widgetu. Ešte v prehliadači, pred vytvorením obrázka, sa plne zakryjú hodnoty všetkých polí formulárov, e-mailové adresy, telefónne čísla, IBAN, čísla kariet, tokeny a prvky označené <code>data-ozvi-mask</code>; prísnejší režim zakryje všetok text. Používateľ môže pred odoslaním doplniť šípky, rámiky aj ďalšie rozmazanie, ktoré sa prenesie priamo do obrázka, alebo screenshot odstrániť.</li>
        <li><b>Požiadavky na server:</b> posledných 30 — metóda, adresa, stav, trvanie a veľkosť. Hlavičky (teda ani <code>Authorization</code>, ani <code>Cookie</code>) sa nezaznamenávajú nikdy, obsah požiadaviek len pri zlyhaných a len ak ho prevádzkovateľ aplikácie zapne.</li>
        <li><b>Kroky v aplikácii:</b> posledných 30 prechodov medzi stránkami, kliknutí na tlačidlá a odkazy (podľa ich názvu) a odoslaní formulárov. Čo kto napísal do polí, sa nečíta nikdy.</li>
        <li><b>Maskovanie:</b> hodnoty parametrov a polí s názvom ako token, secret, password, key, auth, session, card či iban, ďalej e-mailové adresy, IBAN, čísla kariet a prístupové tokeny sa nahradia znakmi <code>***</code>.</li>
        <li><b>Odkaz na záznam relácie</b> (Sentry, PostHog, LogRocket), len ak ho aplikácia sama pripojí.</li>
        <li>Záznam požiadaviek, krokov a odkazy na relácie vidí na boarde a cez MCP len tím projektu. Autor hlásenia ho dostane v exporte svojich údajov (Moje údaje), kým ho tím projektu podľa nastavenia uchovávania nezmaže. Nikomu inému sa nezobrazí a neposiela sa ani vo webhookoch, do GitHubu či iných nástrojov tímu.</li>
      </ul>

      <h2 id="cast-8">8. Komu údaje posielame</h2>
      <p>Úplný zoznam s účelom, rozsahom údajov, miestom spracovania a spôsobom prenosu mimo EÚ je na stránke <Link href="/subprocessors">Subdodávatelia</Link>. Stručne:</p>
      <ul>
        <li><b>Vlastný dedikovaný server v dátovom centre Hetzner v EÚ</b> (Hetzner Online GmbH, Nemecko): aplikácia, databáza, prílohy, sledovanie chýb a návštevnosti. Zálohy idú na samostatný disk toho istého servera a šifrovaná kópia na vlastné úložisko prevádzkovateľa na Slovensku.</li>
        <li><b>Resend</b>: odosielanie e-mailov (prihlásenie, upozornenia) z regiónu v EÚ. Resend, Inc. sídli v USA a je certifikovaný v rámci ochrany údajov EÚ – USA.</li>
        <li><b>Migadu</b> (Švajčiarsko): príjem e-mailov, ktoré nám pošlete.</li>
        <li><b>Creem</b> (Armitage Labs OÜ, Estónsko): platby a faktúry za platené plány, ako samostatný predajca.</li>
        <li><b>Scaleway</b> (Francúzsko, EÚ): len pri projektoch so zapnutými AI funkciami (preklady, súhrny, návrhy noviniek); text sa spracúva v dátových centrách v EÚ a Scaleway ho neukladá.</li>
        <li><b>GitHub, Linear, Jira</b>: len ak ich zákazník v projekte sám pripojí.</li>
      </ul>
      <p>Údaje nepredávame a nepoužívame na reklamu ani na trénovanie AI modelov.</p>
      <p>Písma (aj písma z Google Fonts, ktoré si projekt vyberie v téme) servírujeme z vlastného servera. Váš prehliadač sa pri návšteve Ozvi, boardu ani widgetu nepripája na Google ani na iné CDN s písmami, takže im vaša IP adresa neodchádza.</p>

      <h2 id="cast-9">9. Cookies</h2>
      <p>Používame len cookies nevyhnutné na fungovanie služby, preto sa vás na súhlas nepýtame:</p>
      <ul>
        <li><code>ozvi_app</code>: prihlásenie do konzoly Ozvi.</li>
        <li>Prihlásenie na board: samostatná cookie pre každý board, na ktorom sa prihlásite.</li>
        <li><code>NEXT_LOCALE</code>: jazyk, ktorý si sami vyberiete.</li>
      </ul>
      <p>Widget vo vašej aplikácii žiadne cookies nenastavuje. Analytické ani reklamné cookies nepoužívame.</p>

      <h2 id="cast-10">10. Vlastné servery (self-host)</h2>
      <p>Ozvi na vlastnom serveri prevádzkuje jeho správca a tieto zásady sa naň nevzťahujú. O takej inštalácii sa k nám nič nedostane, okrem zoznamu vydaní, ktorý si server sám stiahne. Ak to správca výslovne zapne, posiela nám raz denne anonymnú štatistiku (náhodné ID inštancie, verziu a súhrnné počty); osobné údaje v nej nie sú.</p>

      <h2 id="cast-11">11. Vaše práva</h2>
      <p>Máte právo na prístup k údajom, ich opravu, vymazanie, obmedzenie spracúvania, prenosnosť a právo namietať proti spracúvaniu na základe oprávneného záujmu. E-mail a meno zmeníte v nastaveniach účtu, tam účet aj zrušíte. S ostatným napíšte na <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>; odpovieme do mesiaca. Sťažnosť môžete podať na Úrad na ochranu osobných údajov SR (dataprotection.gov.sk). Automatizované rozhodovanie ani profilovanie s právnymi účinkami nerobíme.</p>

      <h2 id="cast-12">12. Bezpečnosť</h2>
      <p>Dáta jednotlivých projektov sú v databáze oddelené na úrovni riadkov, tajné kľúče sú šifrované, prístupové tokeny ukladáme len ako odtlačky a všetka komunikácia so službou je šifrovaná (HTTPS). K produkčným dátam má prístup len prevádzkovateľ služby. Ak by došlo k porušeniu ochrany údajov, ktoré sa vás týka, oznámime vám ho bez zbytočného odkladu.</p>

      <h2 id="cast-13">13. Zmluva o spracúvaní a zmeny týchto zásad</h2>
      <p>Pre dáta na boardoch platí medzi zákazníkom a nami <Link href="/dpa">zmluva o spracúvaní osobných údajov</Link> podľa čl. 28 GDPR, ktorá je súčasťou <Link href="/terms">obchodných podmienok</Link>. O podstatných zmenách týchto zásad vás upozorníme e-mailom vopred; dátum a verzia sú uvedené na začiatku stránky.</p>
    </LegalShell>
  );
}
