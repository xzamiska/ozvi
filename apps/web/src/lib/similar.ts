import { PLAN_LIMITS, schema, withSystem, type Db, type PlanName, type Tx } from "@ozvi/db";
import { sql, type SQL } from "drizzle-orm";
import { aiConfig } from "./ai-provider";

/**
 * Duplicate detection. With an embeddings endpoint configured (any OpenAI-compatible API:
 * OpenAI, Ollama, LM Studio, vLLM…) items are embedded by the worker and compared by cosine
 * distance in pgvector. Without it — or for items not embedded yet — trigram similarity on
 * accent-folded text (migration 0007). Self-host gets both; nothing here depends on a plan.
 */

const { items } = schema;
/** Embedding calls cost money: only plans with AI (and self-host) get them; others use text similarity. */
const AI_PLANS = (Object.keys(PLAN_LIMITS) as PlanName[]).filter((p) => PLAN_LIMITS[p].ai);

export interface EmbeddingsConfig { url: string; model: string; key?: string }

/**
 * OZVI_EMBEDDINGS_URL (+ _KEY) wins. Without it, an OpenAI-compatible AI provider (OZVI_AI_PROVIDER=openai)
 * lends its base URL and key, so one Ollama/OpenAI setup needs only OZVI_EMBEDDINGS_MODEL on top.
 */
export function embeddingsConfig(env: Record<string, string | undefined> = process.env): EmbeddingsConfig | null {
  const model = env.OZVI_EMBEDDINGS_MODEL?.trim();
  if (!model) return null;
  const url = env.OZVI_EMBEDDINGS_URL?.trim().replace(/\/+$/, "");
  if (url) return { url, model, key: env.OZVI_EMBEDDINGS_KEY || undefined };
  const ai = aiConfig(env);
  return ai?.provider === "openai" && ai.baseUrl ? { url: ai.baseUrl, model, key: ai.apiKey } : null;
}

export const embedText = (i: { title: string; body: string }) => `${i.title}\n\n${i.body}`.slice(0, 4000);

export async function embed(cfg: EmbeddingsConfig, input: string[], timeoutMs = 20_000): Promise<number[][]> {
  const res = await fetch(`${cfg.url}/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cfg.key && { authorization: `Bearer ${cfg.key}` }) },
    body: JSON.stringify({ model: cfg.model, input }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
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
    const v = (await embed(cfg, [text.slice(0, 4000)], 8_000))[0]!;
    failures = 0;
    return vec(v);
  } catch (e) {
    noteFailure(e);
    return null;
  }
}

export interface SimilarRow {
  id: string; number: number; kind: "bug" | "idea"; title: string; status: string; votes: number; score: number;
  /** Provenance (for MCP lockdown and author.trust). */
  authorId: string | null; source: string;
  /** Filed by Ozvi from customer feedback (context.insight), no person as author. */
  system: boolean;
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
  const where = sql.join([sql`${items.mergedIntoId} is null and ${items.deletedAt} is null and not ${items.pending}`, ...(opts.excludeId ? [sql`${items.id} <> ${opts.excludeId}`] : []), ...(opts.where ?? [])], sql` and `);
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
      if (rows.length) return rows.filter((r) => r.score >= 0.5);
    }
  }

  const q = opts.text.slice(0, 500);
  const pv = opts.pivot?.slice(0, 500) || null;
  // Across languages: compare with the English title pivots of other ideas (content_translations, "en:title"),
  // and the English pivot of the query with both. Pivots exist only on boards with post translation.
  return (await tx.execute(sql`
    select * from (
      select ${cols}, round(greatest(word_similarity(ozvi_fold(${q}), ozvi_fold(${items.title})),
                                     0.7 * word_similarity(ozvi_fold(${q}), ozvi_fold(left(${items.body}, 1000))),
                                     coalesce(word_similarity(ozvi_fold(${q}), ozvi_fold(t.title)), 0),
                                     coalesce(word_similarity(ozvi_fold(${pv}), ozvi_fold(${items.title})), 0),
                                     coalesce(word_similarity(ozvi_fold(${pv}), ozvi_fold(t.title)), 0))::numeric, 3)::float as score
      from ${items}
      left join content_translations t on t.subject_id = ${items.id} and t.target_locale = 'en:title'
        and t.source_hash = encode(sha256(convert_to(${items.title}, 'UTF8')), 'hex')
      where ${where}
    ) s where score >= ${opts.minScore ?? 0.3}
    order by score desc, votes desc limit ${opts.limit}`)) as unknown as SimilarRow[];
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
        and w.plan in (${sql.join(AI_PLANS.map((x) => sql`${x}`), sql`, `)})
        and (e.item_id is null or e.source_md5 <> md5(left(i.title || E'\n\n' || i.body, 4000)))
      order by i.created_at desc limit ${batch}`)) as unknown as { id: string; project_id: string; title: string; body: string }[]);
  if (rows.length === 0) return 0;
  let vectors: number[][];
  try {
    vectors = await embed(cfg, rows.map(embedText));
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
