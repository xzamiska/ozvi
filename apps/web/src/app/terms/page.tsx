import { pageMeta } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import { limitSize, PLAN_LIMITS } from "@ozvi/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalShell } from "@/components/LegalShell";
import { cloudOnly, LEGAL } from "@/lib/legal";

// OZVI_MODE is read at request time (the same image runs self-host and cloud).
export const dynamic = "force-dynamic";
// The text is Slovak only, so is its metadata.
export async function generateMetadata() {
  const s = await getTranslations({ locale: "sk", namespace: "seo" });
  return pageMeta({ title: "Obchodné podmienky – Ozvi", description: s("termsDescription"), path: "/terms", locale: "sk" });
}

const TOC = [
  { id: "cast-1", label: "Kto poskytuje službu" }, { id: "cast-2", label: "Čo je služba a pre koho" }, { id: "cast-3", label: "Účet a priestor" },
  { id: "cast-4", label: "Plány a platby" }, { id: "cast-5", label: "Čo so službou nerobiť" }, { id: "cast-6", label: "Nezákonný obsah" },
  { id: "cast-7", label: "Vaše dáta a zmluva o spracúvaní" }, { id: "cast-8", label: "Dostupnosť" }, { id: "cast-9", label: "Zodpovednosť" },
  { id: "cast-10", label: "Ukončenie a zmeny podmienok" }, { id: "cast-11", label: "Rozhodné právo a spory" },
];

export default function Terms() {
  // Self-hosted instances have their own operator and terms.
  if (!cloudOnly()) notFound();
  const free = PLAN_LIMITS.free;
  return (
    <LegalShell title="Obchodné podmienky" toc={TOC}>
      <h2 id="cast-1">1. Kto poskytuje službu</h2>
      <p>Službu Ozvi na ozvi.io (ďalej „služba“) poskytuje {LEGAL.operator}, so sídlom {LEGAL.address}, IČO {LEGAL.companyId}, DIČ {LEGAL.taxId}, IČ DPH {LEGAL.vatId}, {LEGAL.register} (ďalej „my“). Kontakt: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>, po slovensky, česky alebo anglicky.</p>

      <h2 id="cast-2">2. Čo je služba a pre koho</h2>
      <p>Ozvi je hostovaná služba na zber spätnej väzby k vašej aplikácii: súkromné hlásenia chýb, verejný board s nápadmi, roadmapa, novinky, widget do aplikácie a prepojenia s ďalšími nástrojmi. Rovnaký softvér si môžete prevádzkovať aj na vlastnom serveri podľa jeho licencie; tieto podmienky sa týkajú len hostovanej služby na ozvi.io.</p>
      <p>Služba je určená firmám, organizáciám a ľuďom, ktorí ju používajú pri svojom podnikaní alebo inej odbornej činnosti. Ak ju napriek tomu používate ako spotrebiteľ, platia pre vás aj práva, ktoré vám dáva zákon a ktoré tieto podmienky nemôžu obmedziť.</p>

      <h2 id="cast-3">3. Účet a priestor</h2>
      <ul>
        <li>Účet je viazaný na e-mailovú adresu; prihlasujete sa jednorazovým kódom alebo odkazom. Za prístup k svojej schránke zodpovedáte vy.</li>
        <li>Projekty, tím a predplatné patria do priestoru. Každý účet môže vlastniť jeden bezplatný priestor. Vlastník priestoru zodpovedá za to, koho do neho pozve a aké práva mu dá.</li>
        <li>Účet zrušíte v nastaveniach účtu, priestor v nastaveniach priestoru, projekt v jeho nastaveniach. Zmazanie je trvalé; kým beží platené predplatné, priestor zmazať nejde.</li>
      </ul>

      <h2 id="cast-4">4. Plány a platby</h2>
      <ul>
        <li>Bezplatný plán zahŕňa {free.projects} projekt, {limitSize(free.attachmentBytes)} na prílohy a {free.emailsPerMonth.toLocaleString("sk-SK")} e-mailov mesačne. Platené plány, ich ceny a limity sú v <Link href="/#pricing">cenníku</Link>; ceny sú bez DPH.</li>
        <li>Platené plány sa platia štvrťročne alebo ročne vopred. Predávajúcim je Creem (Armitage Labs OÜ, Estónsko) ako predajca s vlastnou zodpovednosťou (merchant of record): spracuje platbu, vystaví faktúru, vyrieši DPH a prípadné vrátenie peňazí podľa svojich podmienok. Kartu a fakturačné údaje zadávate priamo u Creem, my ich nevidíme.</li>
        <li>Predplatné sa obnovuje automaticky, kým ho nezrušíte. Zrušíte ho v časti Plán a využitie; platí do konca zaplateného obdobia a potom priestor prejde na bezplatný plán. Projekty ani dáta sa pri tom nemažú, len nové nad limit nepôjde založiť a vlastné domény sa vypnú.</li>
        <li>Pri zmene plánu Creem rozdiel rozpočíta: pri vyššom pláne zaplatíte pomernú časť hneď, pri nižšom vám nevyčerpanú časť vráti na kartu.</li>
        <li>Limity sa nevynucujú tvrdo: pri prekročení limitu e-mailov sa upozornenia spoja do denného súhrnu a vlastník dostane správu. AI preklady majú mesačný príspevok podľa plánu; keď sa vyčerpá, ďalšie príspevky sa do konca mesiaca nepreložia.</li>
        <li>Plán môžeme priestoru prideliť aj bezplatne (napríklad partnerom), prípadne na určitý čas; po jeho skončení priestor prejde na bezplatný plán.</li>
        <li>Ceny môžeme zmeniť; zmena sa vás dotkne až od ďalšieho obdobia a oznámime ju e-mailom aspoň 30 dní vopred.</li>
      </ul>

      <h2 id="cast-5">5. Čo so službou nerobiť</h2>
      <p>Službu nesmiete používať na rozosielanie spamu, na nezákonný obsah, na obchádzanie limitov (napríklad zakladaním ďalších účtov), na útoky na službu alebo iných, ani na ukladanie osobitných kategórií osobných údajov (napríklad o zdraví) a údajov o deťoch. Ak to zistíme, môžeme dotknutý obsah odstrániť alebo účet či projekt obmedziť. Ak to ide, najprv vás upozorníme a vždy vám oznámime dôvod.</p>

      <h2 id="cast-6">6. Nezákonný obsah</h2>
      <p>Obsah boardov spravuje zákazník, ktorý board prevádzkuje, a jeho tím. Ak na niektorom boarde nájdete obsah, ktorý považujete za nezákonný, napíšte nám na <a href={`mailto:${LEGAL.email}?subject=Nez%C3%A1konn%C3%BD%20obsah`}>{LEGAL.email}</a>: adresu obsahu, prečo ho považujete za nezákonný, a ak chcete, svoje meno a e-mail. Hlásenie posúdime bez zbytočného odkladu, dáme vedieť prevádzkovateľovi boardu a o výsledku informujeme vás. Rovnaká adresa slúži aj ako kontaktné miesto pre orgány podľa nariadenia o digitálnych službách (DSA).</p>

      <h2 id="cast-7">7. Vaše dáta a zmluva o spracúvaní</h2>
      <ul>
        <li>Obsah, ktorý do služby vložíte vy a vaši používatelia, patrí vám. Používame ho len na poskytovanie služby; nepredávame ho a nepoužívame na reklamu ani na trénovanie AI modelov.</li>
        <li>Pri údajoch vašich používateľov ste vy prevádzkovateľ a my sprostredkovateľ. Súčasťou týchto podmienok je <Link href="/dpa">zmluva o spracúvaní osobných údajov</Link> podľa čl. 28 GDPR; prijatím podmienok ju uzatvárate aj vy. Ak ju potrebujete podpísanú osobitne, napíšte nám.</li>
        <li>Komu údaje posielame, je v <Link href="/subprocessors">zozname subdodávateľov</Link>; ako s nimi zaobchádzame, v <Link href="/privacy">zásadách ochrany súkromia</Link>.</li>
        <li>Každý projekt si môžete kedykoľvek vyexportovať (nastavenia projektu → Dáta projektu) a natrvalo zmazať.</li>
      </ul>

      <h2 id="cast-8">8. Dostupnosť</h2>
      <p>Službu prevádzkujeme s primeranou starostlivosťou a dáta denne zálohujeme, no nesľubujeme nepretržitú dostupnosť ani konkrétnu úroveň dostupnosti. Plánovanú údržbu sa snažíme robiť mimo pracovného času a pri dlhšej odstávke vás vopred upozorníme.</p>

      <h2 id="cast-9">9. Zodpovednosť</h2>
      <p>Zodpovedáme za škodu, ktorú spôsobíme porušením svojich povinností. Voči podnikateľom je celková zodpovednosť obmedzená na sumu, ktorú ste nám za službu zaplatili za 12 mesiacov pred vznikom škody, a nezodpovedáme za ušlý zisk ani nepriame škody. Obmedzenie neplatí pre škodu spôsobenú úmyselne alebo z hrubej nedbanlivosti, pre zodpovednosť voči dotknutým osobám podľa predpisov o ochrane osobných údajov ani tam, kde ho zákon nepripúšťa. Spotrebiteľom zostávajú zachované všetky zákonné práva.</p>

      <h2 id="cast-10">10. Ukončenie a zmeny podmienok</h2>
      <p>Službu môžete prestať používať kedykoľvek. Ak by sme službu ukončili my, oznámime to aspoň 90 dní vopred, aby ste si mohli dáta vyexportovať. O podstatných zmenách týchto podmienok vás upozorníme e-mailom aspoň 30 dní vopred; ak so zmenou nesúhlasíte, môžete službu do jej účinnosti prestať používať a predplatné zrušiť.</p>

      <h2 id="cast-11">11. Rozhodné právo a spory</h2>
      <p>Tieto podmienky sa riadia právom Slovenskej republiky. Spory s podnikateľmi riešia súdy Slovenskej republiky. Spotrebiteľovi zostávajú zachované práva podľa práva krajiny, v ktorej má bydlisko, a môže sa obrátiť aj na subjekt alternatívneho riešenia sporov, na Slovensku napríklad na Slovenskú obchodnú inšpekciu (soi.sk).</p>
    </LegalShell>
  );
}
