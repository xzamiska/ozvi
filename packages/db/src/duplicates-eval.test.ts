import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluate, formatReport, rankOf, runDuplicatesEval } from "./duplicates-eval";
import { createDb, withSystem } from "./index";
import { e5Input, LOCAL_MAX_CHARS, modelsDir } from "./local-embeddings";
import { items, projects, workspaces } from "./schema";

describe("duplicates:eval metrics", () => {
  // Three positives: found first, found second (a tie counts against the original), not found.
  const cases = [
    { target: 0.9, others: [0.5, 0.2] },
    { target: 0.6, others: [0.6, 0.1] },
    { target: 0.2, others: [0.7, 0.4, 0.3] },
  ];
  it("ranks with ties against the original", () => {
    expect(cases.map(rankOf)).toEqual([1, 2, 4]);
  });
  it("recall@k, precision and recall per threshold, top-1 precision and coverage", () => {
    const r = evaluate(cases, [0.3, 0.6, 0.95]);
    expect([r.pairs, r.negatives, r.recallAt1, r.recallAt3]).toEqual([3, 7, 0.333, 0.667]);
    // ≥ 0.3: originals 0.9, 0.6 (2 of 3); others 0.5, 0.6, 0.7, 0.4, 0.3 → precision 2/7.
    // Best candidate ≥ 0.3 for all three, the original is best (alone) only for the first.
    expect(r.thresholds[0]).toEqual({ t: 0.3, precision: 0.286, recall: 0.667, top1Precision: 0.333, top1Coverage: 1 });
    // ≥ 0.6: originals 0.9, 0.6; others 0.6, 0.7 → 2/4.
    expect(r.thresholds[1]).toEqual({ t: 0.6, precision: 0.5, recall: 0.667, top1Precision: 0.333, top1Coverage: 1 });
    expect(r.thresholds[2]).toEqual({ t: 0.95, precision: null, recall: 0, top1Precision: null, top1Coverage: 0 });
    expect(evaluate([]).recallAt1).toBe(0);
  });
  it("e5 prefixes and the models folder", () => {
    expect(e5Input("query", "  Export\nfaktúr ")).toBe("query: Export faktúr");
    expect(e5Input("passage", "x".repeat(5000))).toHaveLength("passage: ".length + LOCAL_MAX_CHARS);
    expect(modelsDir({ OZVI_STORAGE_DIR: "/data/uploads" })).toBe("/data/models");
    expect(modelsDir({ OZVI_MODELS_DIR: "/m" })).toBe("/m");
  });
});

/**
 * Synthetic Slovak board: 15 ideas, each with a duplicate written in other words and merged into it, and 10
 * ideas nobody duplicated. Trigrams always; the local model too with OZVI_EVAL_LOCAL=1 (it downloads ~135 MB
 * into OZVI_MODELS_DIR on first use). The report goes to the console.
 */
const PAIRS: [string, string, string, string][] = [
  ["Export faktúr do CSV", "Chceme faktúry spracovať v Exceli.", "Stiahnuť faktúry ako tabuľku", "Účtovníčka potrebuje všetky doklady za mesiac v Exceli."],
  ["Tmavý režim", "Tmavé farby celej aplikácie.", "Nočný vzhľad aplikácie", "Biele pozadie večer oslepuje."],
  ["Prihlásenie cez Google", "Bez ďalšieho hesla.", "Login pomocou Google účtu", "Nechcem si pamätať ďalšie heslo."],
  ["Opakované faktúry každý mesiac", "Pre paušálnych klientov.", "Automaticky vystaviť rovnakú faktúru mesačne", "Nájom fakturujem stále rovnako."],
  ["Upozornenie na neuhradené faktúry", "E-mail klientovi po splatnosti.", "Pripomienka, keď klient nezaplatí", "Po splatnosti by mu mohol prísť e-mail."],
  ["Mobilná aplikácia pre Android", "Na cesty.", "Appka do telefónu", "Faktúru by som vystavil aj z mobilu."],
  ["Viac mien (EUR, CZK)", "Fakturujeme aj do Česka.", "Fakturácia v českých korunách", "Máme klientov v Brne."],
  ["Import bankového výpisu", "Párovanie platieb.", "Načítať pohyby z banky automaticky", "Ručne odškrtávam zaplatené faktúry."],
  ["Hromadné odoslanie faktúr", "Na konci mesiaca.", "Poslať viac faktúr naraz", "Jedným klikom všetkým klientom."],
  ["Vlastné logo na faktúre", "Značka firmy na dokladoch.", "Pridať logo firmy do PDF", "Doklady vyzerajú neosobne."],
  ["Dvojfaktorové overenie", "Bezpečnosť účtu.", "Bezpečnejšie prihlásenie s kódom z SMS", "Bojím sa o prístup k účtu."],
  ["Štítky na kontakty", "Triedenie zákazníkov.", "Označiť zákazníkov farebnými tagmi", "VIP klientov chcem vidieť hneď."],
  ["Integrácia s Pohodou", "Prenos dokladov do účtovníctva.", "Prepojenie na účtovný softvér Pohoda", "Teraz to účtovníčka prepisuje."],
  ["Zálohové faktúry", "Platba vopred.", "Vystaviť proforma faktúru pred platbou", "Niektorí klienti platia vopred."],
  ["Vyhľadávanie dokladov podľa sumy", "Rýchle nájdenie platby.", "Hľadať faktúru podľa čiastky", "Klient poslal 120 eur a neviem za čo."],
];
const OTHERS = [
  "Tlač štítkov na balíky", "Kalendár splatností", "Fotky produktov v sklade", "Rezervácia termínov online", "Export kontaktov do CSV",
  "Notifikácie do Slacku", "Elektronický podpis zmlúv", "Upozornenie na nízke zásoby", "Cenové ponuky pre klientov", "Tmavé logo v PDF",
];

const url = process.env.DATABASE_URL ?? "postgres://ozvi:ozvi@localhost:5446/ozvi";
const db = createDb(url);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `dups-eval-${Date.now()}`;

describe.skipIf(!up)("duplicates:eval on a synthetic Slovak board", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(workspaces).values({ slug, name: "Eval" }).returning();
      const [p] = await tx.insert(projects).values({ workspaceId: w!.id, slug, name: "Eval", theme: {} }).returning();
      let n = 0;
      const idea = (title: string, body = "") => ({ projectId: p!.id, kind: "idea" as const, number: ++n, title, body, status: "open" as const });
      const originals = await tx.insert(items).values(PAIRS.map(([t, b]) => idea(t, b))).returning();
      await tx.insert(items).values(OTHERS.map((t) => idea(t)));
      await tx.insert(items).values(PAIRS.map(([, , t, b], i) => ({ ...idea(t, b), status: "declined" as const, mergedIntoId: originals[i]!.id })));
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(workspaces).where(eq(workspaces.slug, slug)));
    await db.$client.end();
  });

  it("finds the originals of merged ideas; reports numbers only", { timeout: 600_000 }, async () => {
    const methods = process.env.OZVI_EVAL_LOCAL === "1" ? (["trigram", "local"] as const) : (["trigram"] as const);
    const report = await runDuplicatesEval(db, slug, [...methods], {});
    expect(report.positives).toEqual({ idea: 15, bug: 0 });
    expect(report.candidates).toEqual({ idea: 25, bug: 0 });
    const tri = report.runs.filter((r) => r.method === "trigram");
    expect(tri.map((r) => r.variant)).toEqual(["title", "title+body"]);
    for (const r of report.runs) {
      expect([r.result.pairs, r.result.negatives]).toEqual([15, 15 * 24]);
      expect(r.result.recallAt3).toBeGreaterThanOrEqual(r.result.recallAt1);
    }
    expect(report.skipped).toEqual([]);
    const text = formatReport(report);
    // No titles or bodies in the output (it runs on customer data).
    for (const [a, b, c, d] of PAIRS) for (const s of [a, b, c, d]) expect(text).not.toContain(s);
    console.log(text);
  });

  it("an unknown project is an error, a project without merges reports zero pairs", async () => {
    await expect(runDuplicatesEval(db, `${slug}-nope`, ["trigram"])).rejects.toThrow(/not found/);
    await withSystem(db, async (tx) => {
      const [p] = await tx.select().from(projects).where(eq(projects.slug, slug));
      await tx.insert(projects).values({ workspaceId: p!.workspaceId, slug: `${slug}-empty`, name: "E", theme: {} });
    });
    const r = await runDuplicatesEval(db, `${slug}-empty`, ["trigram"]);
    expect([r.positives, r.runs]).toEqual([{ idea: 0, bug: 0 }, []]);
    expect(formatReport(r)).toContain("no merged pairs");
  });
});
