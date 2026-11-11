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

export default function Privacy() {
  // Self-hosted instances have their own operator and privacy notice.
  if (!cloudOnly()) notFound();
  return (
    <LegalShell title="Ochrana súkromia" toc={[{ id: "cast-1", label: "Účty v Ozvi — sme prevádzkovateľ" }, { id: "cast-2", label: "Dáta na boardoch — sme sprostredkovateľ" }, { id: "cast-3", label: "Komu údaje posielame" }, { id: "cast-4", label: "Cookies" }, { id: "cast-5", label: "Vaše práva" }, { id: "cast-6", label: "Bezpečnosť" }, { id: "cast-7", label: "Zmluva o spracúvaní (pre zákazníkov)" }]}>
      <p>Ozvi spracúva dva druhy osobných údajov a pri každom má inú rolu. Tu je, čo zbierame, prečo, komu to posielame a ako dlho to držíme.</p>

      <h2 id="cast-1">1. Účty v Ozvi — sme prevádzkovateľ</h2>
      <p>Prevádzkovateľ: {LEGAL.operator}, so sídlom {LEGAL.address}, IČO {LEGAL.companyId}, {LEGAL.register}. Kontakt: {LEGAL.email}.</p>
      <ul>
        <li><b>Čo:</b> e-mail, meno (ak ho vyplníte), členstvo v priestoroch, čas posledného prihlásenia. Pri platbách aj identifikátory zákazníka a predplatného v Creem; kartu ani fakturačné údaje nevidíme.</li>
        <li><b>Prečo:</b> aby ste sa mohli prihlásiť a spravovať projekty (plnenie zmluvy) a aby sme vedeli účtovať plány.</li>
        <li><b>Ako dlho:</b> kým účet nezrušíte. Prihlasovacie kódy a odkazy mažeme do 1 dňa, pozvánky po 7 dňoch platnosti.</li>
      </ul>

      <h2 id="cast-2">2. Dáta na boardoch — sme sprostredkovateľ</h2>
      <p>Nápady, hlásenia chýb, komentáre, hlasy, prílohy a technický kontext hlásení (prehliadač, adresa stránky, screenshot) patria zákazníkovi, ktorý board prevádzkuje. My ich spracúvame len podľa jeho pokynov a na základe zmluvy o spracúvaní. Ak ste používateľ niektorej aplikácie a chcete sa na niečo opýtať, obráťte sa na jej prevádzkovateľa.</p>
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
        <li><b>Screenshot:</b> bez widgetu; prvky označené <code>data-ozvi-mask</code> a polia s heslom sú rozmazané. Používateľ môže pred odoslaním doplniť šípky, rámiky aj ďalšie rozmazanie, ktoré sa prenesie priamo do obrázka.</li>
        <li><b>Požiadavky na server:</b> posledných 30 — metóda, adresa, stav, trvanie a veľkosť. Hlavičky (teda ani <code>Authorization</code>, ani <code>Cookie</code>) sa nezaznamenávajú nikdy, obsah požiadaviek len pri zlyhaných a len ak ho prevádzkovateľ aplikácie zapne.</li>
        <li><b>Kroky v aplikácii:</b> posledných 30 prechodov medzi stránkami, kliknutí na tlačidlá a odkazy (podľa ich názvu) a odoslaní formulárov. Čo kto napísal do polí, sa nečíta nikdy.</li>
        <li><b>Maskovanie:</b> hodnoty parametrov a polí s názvom ako token, secret, password, key, auth, session, card či iban, ďalej e-mailové adresy, IBAN, čísla kariet a prístupové tokeny sa nahradia znakmi <code>***</code>.</li>
        <li><b>Odkaz na záznam relácie</b> (Sentry, PostHog, LogRocket), len ak ho aplikácia sama pripojí.</li>
        <li>Záznam požiadaviek, krokov a odkazy na relácie vidí na boarde a cez MCP len tím projektu. Autor hlásenia ho dostane v exporte svojich údajov (Moje údaje), kým ho tím projektu podľa nastavenia uchovávania nezmaže. Nikomu inému sa nezobrazí a neposiela sa ani vo webhookoch, do GitHubu či iných nástrojov tímu.</li>
      </ul>

      <h2 id="cast-3">3. Komu údaje posielame</h2>
      <p>Úplný zoznam s účelom, rozsahom údajov, miestom spracovania a spôsobom prenosu mimo EÚ je na stránke <Link href="/subprocessors">Subdodávatelia</Link>. Stručne:</p>
      <ul>
        <li><b>Vlastný dedikovaný server v dátovom centre Hetzner v EÚ</b> (Hetzner Online GmbH, Nemecko) — aplikácia, databáza a prílohy. Zálohy idú na samostatný disk toho istého servera a ďalšia kópia na vlastné úložisko prevádzkovateľa na Slovensku.</li>
        <li><b>Resend</b> — odosielanie e-mailov (prihlásenie, upozornenia).</li>
        <li><b>Creem</b> — platby a faktúry za platené plány (ako samostatný predajca).</li>
        <li><b>Scaleway</b> (Francúzsko, EÚ) — len pri projektoch so zapnutými AI funkciami (preklady, súhrny, návrhy noviniek); text sa spracúva v dátových centrách v EÚ.</li>
        <li><b>GitHub, Linear, Jira</b> — len ak ich zákazník v projekte sám pripojí.</li>
      </ul>
      <p>Údaje nepredávame a nepoužívame na reklamu.</p>
      <p>Písma (aj písma z Google Fonts, ktoré si projekt vyberie v téme) servírujeme z vlastného servera. Váš prehliadač sa pri návšteve Ozvi, boardu ani widgetu nepripája na Google ani na iné CDN s písmami, takže im vaša IP adresa neodchádza.</p>

      <h2 id="cast-4">4. Cookies</h2>
      <p>Používame len nevyhnutné cookies na prihlásenie (do Ozvi a na jednotlivé boardy). Žiadne analytické ani reklamné cookies, preto sa vás na súhlas nepýtame.</p>
      <p>Návštevnosť verejných stránok Ozvi (úvodná stránka, dokumentácia, cenník) počítame na našom serveri nástrojom Umami, ktorý prevádzkujeme sami v EÚ. Zaznamená sa adresa stránky (bez parametrov), odkiaľ ste prišli, jazyk a typ prehliadača; IP adresu Umami použije len na odhad krajiny a na denne sa meniaci anonymný odtlačok, neukladá ju. Nič sa neukladá vo vašom zariadení ani z neho nečíta. Ak má prehliadač zapnuté „nesledovať“ (Do Not Track alebo Global Privacy Control), nezaznamenáme nič. Boardy, konzolu ani widget nesledujeme. Právny základ: oprávnený záujem na tom, aby sme vedeli, ktoré stránky ľudia čítajú.</p>

      <h2 id="cast-5">5. Vaše práva</h2>
      <p>Máte právo na prístup k údajom, ich opravu, vymazanie, obmedzenie spracúvania, prenosnosť a právo namietať. E-mail a meno zmeníte v nastaveniach účtu, tam účet aj zrušíte. S ostatným napíšte na {LEGAL.email}. Sťažnosť môžete podať na Úrad na ochranu osobných údajov SR.</p>

      <h2 id="cast-6">6. Bezpečnosť</h2>
      <p>Dáta jednotlivých projektov sú v databáze oddelené na úrovni riadkov, tajné kľúče sú šifrované, prístupové tokeny ukladáme len ako odtlačky. Ak by došlo k úniku, ktorý sa vás týka, oznámime vám ho bez zbytočného odkladu.</p>

      <h2 id="cast-7">7. Zmluva o spracúvaní (pre zákazníkov)</h2>
      <p>Pre dáta na boardoch platí medzi vami a nami zmluva o spracúvaní osobných údajov podľa čl. 28 GDPR: predmet a účel (prevádzka boardu), kategórie údajov (identita z vašej aplikácie, obsah spätnej väzby, technický kontext), opatrenia z bodu 6, <Link href="/subprocessors">zoznam subdodávateľov</Link> (o zmene vás vopred upozorníme), pomoc s právami dotknutých osôb a oznámenie incidentu do 48 hodín. Podpísanú verziu vám pošleme na požiadanie.</p>
    </LegalShell>
  );
}
