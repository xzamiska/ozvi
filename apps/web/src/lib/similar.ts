import { PLAN_LIMITS, schema, withSystem, type Db, type PlanName, type Tx } from "@ozvi/db";
import { embedLocal, loadLocalModel, LOCAL_MODEL, localModelReady } from "@ozvi/db/local-embeddings";
import { embedApi, similarPool, trigramSimilarQuery } from "@ozvi/db/similarity";
import { sql, type SQL } from "drizzle-orm";
import { aiConfig } from "./ai-provider";

/**
 * Duplicate detection. With embeddings configured — an OpenAI-compatible API (OpenAI, Ollama, LM Studio,
 * vLLM…) or the local model (OZVI_EMBEDDINGS=local, packages/db local-embeddings.ts) — items are embedded
 * by the worker and compared by cosine distance in pgvector. Without it — or for items not embedded yet —
 * trigram similarity on accent-folded text (migration 0007). Self-host gets all of it.
 */

const { items } = schema;
const ALL_PLANS = Object.keys(PLAN_LIMITS) as PlanName[];
/** Embedding API calls cost money: only plans with AI (and self-host) get them; others use text similarity. */
const AI_PLANS = ALL_PLANS.filter((p) => PLAN_LIMITS[p].ai);

export type EmbeddingsConfig =
  | { provider: "api"; url: string; model: string; key?: string }
  /** The local model; `model` is what item_embeddings.model holds for it. */
  | { provider: "local"; model: string };

/**
 * OZVI_EMBEDDINGS=local: the model inside Ozvi. Otherwise OZVI_EMBEDDINGS_URL (+ _KEY) wins; without it, an
 * OpenAI-compatible AI provider (OZVI_AI_PROVIDER=openai) lends its base URL and key, so one Ollama/OpenAI
 * setup needs only OZVI_EMBEDDINGS_MODEL on top.
 */
export function embeddingsConfig(env: Record<string, string | undefined> = process.env): EmbeddingsConfig | null {
  if (env.OZVI_EMBEDDINGS?.trim().toLowerCase() === "local") return { provider: "local", model: LOCAL_MODEL };
  const model = env.OZVI_EMBEDDINGS_MODEL?.trim();
  if (!model) return null;
  const url = env.OZVI_EMBEDDINGS_URL?.trim().replace(/\/+$/, "");
  if (url) return { provider: "api", url, model, key: env.OZVI_EMBEDDINGS_KEY || undefined };
  const ai = aiConfig(env);
  return ai?.provider === "openai" && ai.baseUrl ? { provider: "api", url: ai.baseUrl, model, key: ai.apiKey } : null;
}

/** Plans whose boards get embeddings: the local model costs nothing per call, so every plan; an API only plans with AI. */
export const embeddingPlans = (cfg: EmbeddingsConfig): PlanName[] => (cfg.provider === "local" ? ALL_PLANS : AI_PLANS);
/** Similarity by meaning for a board on `plan` (null config = off everywhere). */
export const embeddingsFor = (plan: PlanName, cfg: EmbeddingsConfig | null = embeddingsConfig()) => !!cfg && embeddingPlans(cfg).includes(plan);

export const embedText = (i: { title: string; body: string }) => `${i.title}\n\n${i.body}`.slice(0, 4000);

/**
 * Embeds `input` as queries (typed text) or as stored items ("passage"). The API gets plain text; the local
 * e5 model needs its role prefix (local-embeddings.ts e5Input).
 */
export async function embed(cfg: EmbeddingsConfig, input: string[], role: "query" | "passage", timeoutMs = 20_000): Promise<number[][]> {
  // The library and the model load on first use only (they stay out of the process otherwise).
  if (cfg.provider === "local") return embedLocal(input, role);
  return embedApi(cfg, input, timeoutMs);
}

const vec = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;

/* Table presence: re-checked every 5 minutes while missing, so installing pgvector later just works. */
let tableCheckedAt = 0;
let tableExists = false;
export async function hasEmbeddingsTable(tx: Tx | Db): Promise<boolean> {
  if (tableExists || Date.now() - tableCheckedAt < 300_000) return tableExists;
  tableCheckedAt = Date.now();
  const r = (await tx.execute(sql`select to_regclass('item_embeddings') is not null as ok, exists(select 1 from pg_extension where extname = 'vector') as ext`)) as unknown as { ok: boolean; ext: boolean }[];
  if (!r[0]?.ok && r[0]?.ext) {
    // pgvector was installed after migration 0006 ran: create the table now (the app role owns the schema).
    try {
      await tx.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS item_embeddings (
          item_id uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
          project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          model text NOT NULL, embedding vector NOT NULL, source_md5 text NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now());
        CREATE INDEX IF NOT EXISTS item_embeddings_project ON item_embeddings (project_id, model);
        ALTER TABLE item_embeddings ENABLE ROW LEVEL SECURITY;
        ALTER TABLE item_embeddings FORCE ROW LEVEL SECURITY;
        DO $$ BEGIN CREATE POLICY tenant ON item_embeddings USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id));
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`));
      tableExists = true;
    } catch (e) {
      console.warn("[ozvi] could not create item_embeddings", e);
    }
  } else {
    tableExists = !!r[0]?.ok;
  }
  return tableExists;
}

/* Circuit breaker: after a failure, no remote embedding calls for a while (1 → 30 min). */
let pausedUntil = 0;
let failures = 0;
const available = () => Date.now() >= pausedUntil;
function noteFailure(e: unknown) {
  failures++;
  pausedUntil = Date.now() + Math.min(30, 2 ** (failures - 1)) * 60_000;
  console.warn(`[ozvi] embeddings failed (${failures}×), pausing`, e instanceof Error ? e.message : e);
}

/** Embeds a query for MCP/text search, outside any transaction. Null when unavailable. */
export async function embedQuery(text: string): Promise<string | null> {
  const cfg = embeddingsConfig();
  if (!cfg || !available()) return null;
  try {
    if (cfg.provider === "local") {
      // Never wait for the download or the load in a request: text similarity until the model is ready.
      if (!localModelReady()) {
        void loadLocalModel().catch(noteFailure);
        return null;
      }
    }
    const v = (await embed(cfg, [text.slice(0, 4000)], "query", 8_000))[0]!;
    failures = 0;
    return vec(v);
  } catch (e) {
    noteFailure(e);
    return null;
  }
}

/**
 * How a similarity score was computed; each method has its own scale, so its own thresholds.
 * "embeddings" = an embeddings API, "local" = the local e5 model (its cosines sit higher: unrelated texts ≈ 0.8).
 */
export type SimilarMethod = "embeddings" | "local" | "trigram";

/**
 * Thresholds per method (ADR-0015). SHOW: lowest score listed to the author while writing (recall).
 * STRONG: lowest score for which the form asks once on submit "is it this one?" (precision).
 * Measure with `node ozvi.mjs duplicates:eval` (packages/db duplicates-eval.ts) on boards with merges. The local
 * model's values come from a synthetic Slovak board (15 merged pairs, Nov 2026: title only, SHOW 0.86 → recall
 * 80 %; STRONG 0.89 → asked for 13 % of duplicates, right in half of them); trigram and API values are the
 * phase 1 starting points. Recalibrate on real merged pairs before relying on them.
 */
export const SIMILAR_SHOW: Record<SimilarMethod, number> = { trigram: 0.3, embeddings: 0.6, local: 0.86 };
export const SIMILAR_STRONG: Record<SimilarMethod, number> = { trigram: 0.7, embeddings: 0.85, local: 0.89 };
/** Below this, an embeddings match is not listed anywhere (the team's panel, MCP); trigrams use `minScore`. */
const SIMILAR_FLOOR: Record<Exclude<SimilarMethod, "trigram">, number> = { embeddings: 0.5, local: 0.84 };

/** Rows at or above their own method's threshold (SIMILAR_SHOW or SIMILAR_STRONG). */
export const atLeast = <R extends Pick<SimilarRow, "score" | "method">>(rows: R[], thresholds: Record<SimilarMethod, number>) =>
  rows.filter((r) => r.score >= thresholds[r.method]);

export interface SimilarRow {
  id: string; number: number; kind: "bug" | "idea"; title: string; status: string; votes: number; score: number;
  /** Provenance (for MCP lockdown and author.trust). */
  authorId: string | null; source: string;
  /** Filed by Ozvi from customer feedback (context.insight), no person as author. */
  system: boolean;
  /** Which method produced `score` (compare it with that method's threshold). */
  method: SimilarMethod;
}

/**
 * Items similar to `text`, or to the stored embedding of item `excludeId`. Never calls the
 * embeddings API itself (it runs inside a request transaction): pass `queryVector` from
 * embedQuery() computed beforehand. Falls back to trigram similarity.
 */
export async function findSimilar(
  tx: Tx, opts: { text: string; excludeId?: string; limit: number; where?: SQL[]; minScore?: number; queryVector?: string | null;
    /** English version of `text` (lib/translate.ts pivots): matches ideas written in other languages. */
    pivot?: string | null },
): Promise<SimilarRow[]> {
  const cfg = embeddingsConfig();
  const where = similarPool(opts);
  const cols = sql`${items.id} as id, ${items.number} as number, ${items.kind} as kind, ${items.title} as title, ${items.status} as status, ${items.voteCount} as votes, ${items.authorId} as "authorId", ${items.source} as source, coalesce((${items.context}->>'insight')::boolean, false) as "system"`;

  if (cfg && (await hasEmbeddingsTable(tx))) {
    let target = opts.queryVector ?? null;
    if (!target && opts.excludeId) {
      const r = (await tx.execute(sql`select embedding::text as e from item_embeddings where item_id = ${opts.excludeId} and model = ${cfg.model}`)) as unknown as { e: string }[];
      target = r[0]?.e ?? null;
    }
    if (target) {
      const rows = (await tx.execute(sql`
        select ${cols}, round((1 - (e.embedding <=> ${target}::vector))::numeric, 3)::float as score
        from ${items} join item_embeddings e on e.item_id = ${items.id} and e.model = ${cfg.model}
        where ${where}
        order by e.embedding <=> ${target}::vector limit ${opts.limit}`)) as unknown as SimilarRow[];
      const method = cfg.provider === "local" ? "local" as const : "embeddings" as const;
      if (rows.length) return rows.filter((r) => r.score >= SIMILAR_FLOOR[method]).map((r) => ({ ...r, method }));
    }
  }

  // Across languages: compare with the English title pivots of other ideas (content_translations, "en:title"),
  // and the English pivot of the query with both. Pivots exist only on boards with post translation.
  const rows = (await tx.execute(trigramSimilarQuery({ cols, where, text: opts.text, pivot: opts.pivot, minScore: opts.minScore ?? 0.3, limit: opts.limit }))) as unknown as Omit<SimilarRow, "method">[];
  return rows.map((r) => ({ ...r, method: "trigram" as const }));
}

/**
 * Worker step: embed up to `batch` new or changed items. Reads candidates, calls the API with
 * no transaction or row locks open, then writes. Several replicas may occasionally embed the
 * same item twice; that is harmless.
 */
export async function embedPending(db: Db, batch = 32): Promise<number> {
  const cfg = embeddingsConfig();
  if (!cfg || !available() || !(await hasEmbeddingsTable(db))) return 0;
  const rows = await withSystem(db, async (tx) => (await tx.execute(sql`
      select i.id, i.project_id, i.title, i.body from ${items} i
      left join item_embeddings e on e.item_id = i.id and e.model = ${cfg.model}
      join ${schema.projects} p on p.id = i.project_id
      join ${schema.workspaces} w on w.id = p.workspace_id
      where i.merged_into_id is null and i.deleted_at is null
        and w.plan in (${sql.join(embeddingPlans(cfg).map((x) => sql`${x}`), sql`, `)})
        and (e.item_id is null or e.source_md5 <> md5(left(i.title || E'\n\n' || i.body, 4000)))
      order by i.created_at desc limit ${batch}`)) as unknown as { id: string; project_id: string; title: string; body: string }[]);
  if (rows.length === 0) return 0;
  let vectors: number[][];
  try {
    vectors = await embed(cfg, rows.map(embedText), "passage");
    failures = 0;
  } catch (e) {
    noteFailure(e);
    return 0;
  }
  await withSystem(db, async (tx) => {
    for (const [i, r] of rows.entries()) {
      await tx.execute(sql`
        insert into item_embeddings (item_id, project_id, model, embedding, source_md5, updated_at)
        values (${r.id}, ${r.project_id}, ${cfg.model}, ${vec(vectors[i]!)}::vector, md5(left(${r.title} || E'\n\n' || ${r.body}, 4000)), now())
        on conflict (item_id) do update set model = excluded.model, embedding = excluded.embedding, source_md5 = excluded.source_md5, updated_at = now()`);
    }
  });
  return rows.length;
}
