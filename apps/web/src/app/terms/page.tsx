import { pageMeta } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import { PLAN_LIMITS } from "@ozvi/db";
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

export default function Terms() {
  // Self-hosted instances have their own operator and terms.
  if (!cloudOnly()) notFound();
  const free = PLAN_LIMITS.free;
  return (
    <LegalShell title="Obchodné podmienky" toc={[{ id: "cast-1", label: "Kto poskytuje službu" }, { id: "cast-2", label: "Čo je služba" }, { id: "cast-3", label: "Účet" }, { id: "cast-4", label: "Plány a platby" }, { id: "cast-5", label: "Čo so službou nerobiť" }, { id: "cast-6", label: "Vaše dáta" }, { id: "cast-7", label: "Dostupnosť" }, { id: "cast-8", label: "Zodpovednosť" }, { id: "cast-9", label: "Ukončenie a zmeny podmienok" }, { id: "cast-10", label: "Rozhodné právo" }]}>
      <h2 id="cast-1">1. Kto poskytuje službu</h2>
      <p>Službu Ozvi (ďalej „služba“) poskytuje {LEGAL.operator}, so sídlom {LEGAL.address}, IČO {LEGAL.companyId}, DIČ {LEGAL.taxId}, IČ DPH {LEGAL.vatId}, {LEGAL.register} (ďalej „my“). Kontakt: {LEGAL.email}.</p>

      <h2 id="cast-2">2. Čo je služba</h2>
      <p>Ozvi je hostovaná služba na zber spätnej väzby: súkromné hlásenia chýb, verejný board s nápadmi, roadmapa a novinky pre vašu aplikáciu. Rovnaký softvér si môžete prevádzkovať aj na vlastnom serveri podľa jeho licencie; tieto podmienky sa týkajú len hostovanej služby.</p>

      <h2 id="cast-3">3. Účet</h2>
      <ul>
        <li>Účet je viazaný na e-mailovú adresu; prihlasujete sa jednorazovým kódom alebo odkazom. Za prístup k svojej schránke zodpovedáte vy.</li>
        <li>Každý účet môže vlastniť jeden bezplatný priestor. Do priestoru môžete pozvať ďalších ľudí; vlastník priestoru zodpovedá za to, koho pozve.</li>
        <li>Účet môžete kedykoľvek zrušiť v nastaveniach účtu.</li>
      </ul>

      <h2 id="cast-4">4. Plány a platby</h2>
      <ul>
        <li>Bezplatný plán zahŕňa {free.projects} projekt, {free.attachmentBytes / 1024 ** 3} GB na prílohy a {free.emailsPerMonth.toLocaleString("sk-SK")} e-mailov mesačne. Platené plány a ich limity sú uvedené v <Link href="/#ceny">cenníku</Link>.</li>
        <li>Platené plány sa platia štvrťročne alebo ročne vopred. Platby spracúva Creem ako predajca (merchant of record): Creem vystavuje faktúry, rieši DPH a vrátenie peňazí podľa svojich podmienok.</li>
        <li>Predplatné sa obnovuje automaticky, kým ho nezrušíte. Po zrušení platí do konca zaplateného obdobia; potom priestor prejde na bezplatný plán. Projekty ani dáta sa pri tom nemažú, len nové nad limit nepôjde založiť a vlastné domény sa vypnú.</li>
        <li>Pri prekročení limitu e-mailov nič neblokujeme — upozornenia sa spoja do denného súhrnu a vlastník dostane správu.</li>
        <li>Ceny môžeme zmeniť; zmena sa vás dotkne až od ďalšieho obdobia a oznámime ju e-mailom aspoň 30 dní vopred.</li>
      </ul>

      <h2 id="cast-5">5. Čo so službou nerobiť</h2>
      <p>Službu nesmiete používať na rozosielanie spamu, na nezákonný obsah, na obchádzanie limitov (napríklad zakladaním ďalších účtov) ani na útoky na službu alebo iných. Ak to zistíme, môžeme dotknutý obsah odstrániť alebo účet pozastaviť; ak to ide, najprv vás upozorníme.</p>

      <h2 id="cast-6">6. Vaše dáta</h2>
      <ul>
        <li>Obsah, ktorý do služby vložíte vy a vaši používatelia, patrí vám. Používame ho len na poskytovanie služby.</li>
        <li>Pri údajoch vašich používateľov sme sprostredkovateľom a vy prevádzkovateľom; podrobnosti sú v <Link href="/privacy">zásadách ochrany súkromia</Link>, v <Link href="/subprocessors">zozname subdodávateľov</Link> a v zmluve o spracúvaní (DPA) podľa čl. 28 GDPR. <a href={`mailto:${LEGAL.email}?subject=DPA`}>Vzor zmluvy o spracúvaní</a> vám pošleme na požiadanie a podpísaný vrátime.</li>
        <li>Každý projekt si môžete kedykoľvek vyexportovať (nastavenia projektu → Dáta projektu) a natrvalo zmazať.</li>
      </ul>

      <h2 id="cast-7">7. Dostupnosť</h2>
      <p>Službu prevádzkujeme s primeranou starostlivosťou a dáta denne zálohujeme, no nesľubujeme nepretržitú dostupnosť. Plánovanú údržbu sa snažíme robiť mimo pracovného času.</p>

      <h2 id="cast-8">8. Zodpovednosť</h2>
      <p>Celková zodpovednosť za škodu, ktorú spôsobíme, je obmedzená na sumu, ktorú ste nám zaplatili za posledných 12 mesiacov, v rozsahu, v akom to zákon dovoľuje. Nezodpovedáme za ušlý zisk ani nepriame škody.</p>

      <h2 id="cast-9">9. Ukončenie a zmeny podmienok</h2>
      <p>Službu môžete prestať používať kedykoľvek. Ak by sme službu ukončili my, oznámime to aspoň 90 dní vopred, aby ste si mohli dáta vyexportovať. O podstatných zmenách týchto podmienok vás upozorníme e-mailom aspoň 30 dní vopred.</p>

      <h2 id="cast-10">10. Rozhodné právo</h2>
      <p>Tieto podmienky sa riadia právom Slovenskej republiky. Spotrebiteľom zostávajú zachované práva, ktoré im dáva právo ich krajiny.</p>
    </LegalShell>
  );
}
