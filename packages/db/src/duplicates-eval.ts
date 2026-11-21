import { eq, sql } from "drizzle-orm";
import { withProject, type Db, type Tx } from "./index";
import { embedLocal, LOCAL_MODEL, type E5Role } from "./local-embeddings";
import { items, projects } from "./schema";
import { cosine, embedApi, similarPool, trigramSimilarQuery, type ApiEmbeddings } from "./similarity";

/**
 * `node ozvi.mjs duplicates:eval --project <slug> [--method trigram|api|local|all] [--json]` (ADR-0015 phase 2):
 * how well each similarity method finds the original of items the team merged. Positives = (merged item →
 * the item it was merged into), same kind; negatives = every other item that findSimilar could have offered
 * (not merged, deleted or queued, same kind). The merged item is typed again as its title alone (what the
 * form and the team's panel search with) and as title + body (MCP). Runs on customer data: prints numbers
 * and counts only, never titles, bodies or item numbers.
 */

/** One positive: the original's score and the scores of every other candidate for the same query. */
export interface EvalCase { target: number; others: number[] }

export interface ThresholdRow {
  t: number;
  /** Of all (query, candidate) pairs scoring ≥ t, the share that are the original (null: none scored that high). */
  precision: number | null;
  /** Share of positives whose original scores ≥ t. */
  recall: number;
  /** Queries whose best candidate scores ≥ t: share of them where the best is the original (the question on submit). */
  top1Precision: number | null;
  /** Share of positives with a best candidate ≥ t (how often the question would be asked). */
  top1Coverage: number;
}

export interface EvalResult {
  pairs: number; negatives: number;
  recallAt1: number; recallAt3: number;
  thresholds: ThresholdRow[];
}

export const EVAL_THRESHOLDS = Array.from({ length: 14 }, (_, i) => Math.round((0.3 + i * 0.05) * 100) / 100);
/** Embedding cosines crowd into the top of the scale (e5: unrelated ≈ 0.8): 0.01 steps there as well. */
export const EVAL_THRESHOLDS_FINE = [...new Set([...EVAL_THRESHOLDS, ...Array.from({ length: 15 }, (_, i) => Math.round((0.8 + i * 0.01) * 100) / 100)])].sort((a, b) => a - b);

const share = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 1000 : 0);

/** Rank of the original among the candidates; ties count against it (a tie is not a find). */
export const rankOf = (c: EvalCase) => 1 + c.others.filter((s) => s >= c.target).length;

export function evaluate(cases: EvalCase[], thresholds = EVAL_THRESHOLDS): EvalResult {
  const pairs = cases.length;
  const ranks = cases.map(rankOf);
  return {
    pairs,
    negatives: cases.reduce((n, c) => n + c.others.length, 0),
    recallAt1: share(ranks.filter((r) => r <= 1).length, pairs),
    recallAt3: share(ranks.filter((r) => r <= 3).length, pairs),
    thresholds: thresholds.map((t) => {
      const tp = cases.filter((c) => c.target >= t).length;
      const fp = cases.reduce((n, c) => n + c.others.filter((s) => s >= t).length, 0);
      const covered = cases.filter((c) => Math.max(c.target, ...c.others) >= t);
      const right = covered.filter((c) => rankOf(c) === 1).length;
      return {
        t,
        precision: tp + fp ? share(tp, tp + fp) : null,
        recall: share(tp, pairs),
        top1Precision: covered.length ? share(right, covered.length) : null,
        top1Coverage: share(covered.length, pairs),
      };
    }),
  };
}

export type EvalMethod = "trigram" | "api" | "local";
export type EvalVariant = "title" | "title+body";

export interface EvalRun { method: string; variant: EvalVariant; result: EvalResult }

interface Row { id: string; kind: "bug" | "idea"; title: string; body: string }
interface Positive extends Row { target: string; pivot: string | null }

const typed = (r: Row, v: EvalVariant) => (v === "title" ? r.title : `${r.title}\n\n${r.body}`.trim());

async function loadData(tx: Tx) {
  // Positives: merged into an item that is still a candidate (not deleted, merged further or queued), same kind.
  const positives = (await tx.execute(sql`
    select s.id, s.kind, s.title, s.body, s.merged_into_id as target, p.title as pivot
    from ${items} s join ${items} t on t.id = s.merged_into_id
    left join content_translations p on p.subject_id = s.id and p.target_locale = 'en:title'
      and p.source_hash = encode(sha256(convert_to(s.title, 'UTF8')), 'hex')
    where s.kind = t.kind and s.deleted_at is null and t.deleted_at is null and t.merged_into_id is null and not t.pending
    order by s.created_at`)) as unknown as Positive[];
  const pool = await tx.select({ id: items.id, kind: items.kind, title: items.title, body: items.body }).from(items).where(similarPool({}));
  return { positives, pool: pool as Row[] };
}

/** Scores with exactly the board's trigram query (lib/similar.ts findSimilar), every candidate. */
async function trigramCases(tx: Tx, positives: Positive[], v: EvalVariant): Promise<EvalCase[]> {
  const out: EvalCase[] = [];
  for (const p of positives) {
    const rows = (await tx.execute(trigramSimilarQuery({
      cols: sql`${items.id} as id, ${items.voteCount} as votes`,
      where: similarPool({ excludeId: p.id, where: [eq(items.kind, p.kind)] }),
      text: typed(p, v), pivot: p.pivot, minScore: 0, limit: 1_000_000,
    }))) as unknown as { id: string; score: number }[];
    out.push(caseOf(p, rows));
  }
  return out;
}

function caseOf(p: Positive, scored: { id: string; score: number }[]): EvalCase {
  return { target: scored.find((r) => r.id === p.target)?.score ?? 0, others: scored.filter((r) => r.id !== p.target).map((r) => r.score) };
}

type Embedder = (texts: string[], role: E5Role) => Promise<number[][]>;

async function vectorCases(embedder: Embedder, positives: Positive[], pool: Row[], v: EvalVariant, poolRole: E5Role): Promise<EvalCase[]> {
  const poolVectors = new Map<string, number[]>();
  const vs = await embedder(pool.map((r) => `${r.title}\n\n${r.body}`.slice(0, 4000)), poolRole);
  pool.forEach((r, i) => poolVectors.set(r.id, vs[i]!));
  const queries = await embedder(positives.map((p) => typed(p, v).slice(0, 4000)), "query");
  return positives.map((p, i) => caseOf(p, pool.filter((r) => r.kind === p.kind && r.id !== p.id)
    .map((r) => ({ id: r.id, score: Math.round(cosine(queries[i]!, poolVectors.get(r.id)!) * 1000) / 1000 }))));
}

export function apiFromEnv(env: Record<string, string | undefined>): ApiEmbeddings | null {
  const url = env.OZVI_EMBEDDINGS_URL?.trim().replace(/\/+$/, "");
  const model = env.OZVI_EMBEDDINGS_MODEL?.trim();
  return url && model ? { url, model, key: env.OZVI_EMBEDDINGS_KEY || undefined } : null;
}

export interface EvalReport { project: string; positives: { idea: number; bug: number }; candidates: { idea: number; bug: number }; runs: EvalRun[]; skipped: string[] }

export async function runDuplicatesEval(db: Db, slug: string, methods: EvalMethod[], env: Record<string, string | undefined> = process.env): Promise<EvalReport> {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, slug));
  if (!project) throw new Error(`project "${slug}" not found`);
  const { positives, pool } = await withProject(db, project.id, loadData);
  const count = (rows: Row[], k: Row["kind"]) => rows.filter((r) => r.kind === k).length;
  const report: EvalReport = {
    project: slug,
    positives: { idea: count(positives, "idea"), bug: count(positives, "bug") },
    candidates: { idea: count(pool, "idea"), bug: count(pool, "bug") },
    runs: [], skipped: [],
  };
  if (!positives.length) return report;
  const variants: EvalVariant[] = ["title", "title+body"];
  for (const m of methods) {
    if (m === "trigram") {
      for (const v of variants) report.runs.push({ method: "trigram", variant: v, result: evaluate(await withProject(db, project.id, (tx) => trigramCases(tx, positives, v))) });
    } else if (m === "api") {
      const cfg = apiFromEnv(env);
      if (!cfg) { report.skipped.push("api: set OZVI_EMBEDDINGS_URL and OZVI_EMBEDDINGS_MODEL (+ OZVI_EMBEDDINGS_KEY)"); continue; }
      const embedder: Embedder = async (texts) => {
        const out: number[][] = [];
        for (let i = 0; i < texts.length; i += 64) out.push(...(await embedApi(cfg, texts.slice(i, i + 64), 60_000)));
        return out;
      };
      for (const v of variants) report.runs.push({ method: `api:${cfg.model}`, variant: v, result: evaluate(await vectorCases(embedder, positives, pool, v, "passage"), EVAL_THRESHOLDS_FINE) });
    } else {
      const embedder: Embedder = (texts, role) => embedLocal(texts, role);
      // As the board runs it (typed text = "query: ", stored items = "passage: "), and symmetric (both "query: ",
      // what the e5 authors suggest for paraphrase search): the numbers decide which one the board uses.
      for (const v of variants) report.runs.push({ method: LOCAL_MODEL, variant: v, result: evaluate(await vectorCases(embedder, positives, pool, v, "passage"), EVAL_THRESHOLDS_FINE) });
      for (const v of variants) report.runs.push({ method: `${LOCAL_MODEL} (query/query)`, variant: v, result: evaluate(await vectorCases(embedder, positives, pool, v, "query"), EVAL_THRESHOLDS_FINE) });
    }
  }
  return report;
}

const pct = (x: number | null) => (x === null ? "    –" : `${(x * 100).toFixed(1).padStart(5)}`);

/** Plain-text report: counts and rates only. */
export function formatReport(r: EvalReport): string {
  const lines = [
    `duplicates:eval  project=${r.project}`,
    `positives (merged pairs): ideas ${r.positives.idea}, bugs ${r.positives.bug}   candidates: ideas ${r.candidates.idea}, bugs ${r.candidates.bug}`,
  ];
  for (const s of r.skipped) lines.push(`skipped ${s}`);
  if (!r.runs.length) {
    if (!r.positives.idea && !r.positives.bug) lines.push("no merged pairs to evaluate");
    return lines.join("\n");
  }
  lines.push("", "method                                       variant      pairs  negatives  R@1    R@3");
  for (const run of r.runs) {
    lines.push(`${run.method.padEnd(44)} ${run.variant.padEnd(12)} ${String(run.result.pairs).padStart(5)}  ${String(run.result.negatives).padStart(9)}  ${pct(run.result.recallAt1)}  ${pct(run.result.recallAt3)}`);
  }
  for (const run of r.runs) {
    lines.push("", `${run.method} · ${run.variant}  (%: precision, recall of score ≥ t; top-1 precision and coverage)`, "   t   prec    rec   top1  cover");
    for (const t of run.result.thresholds) lines.push(`${t.t.toFixed(2)}  ${pct(t.precision)}  ${pct(t.recall)}  ${pct(t.top1Precision)}  ${pct(t.top1Coverage)}`);
  }
  return lines.join("\n");
}
