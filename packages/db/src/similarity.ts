import { sql, type SQL } from "drizzle-orm";
import { items } from "./schema";

/**
 * Duplicate detection pieces shared by the web app (apps/web lib/similar.ts findSimilar) and the operator CLI
 * (duplicates:eval), so the evaluation measures exactly what the board runs.
 */

/** Items that can be a duplicate's original: not merged, deleted or waiting in the queue; never `excludeId`. */
export function similarPool(opts: { excludeId?: string; where?: SQL[] }): SQL {
  return sql.join([
    sql`${items.mergedIntoId} is null and ${items.deletedAt} is null and not ${items.pending}`,
    ...(opts.excludeId ? [sql`${items.id} <> ${opts.excludeId}`] : []),
    ...(opts.where ?? []),
  ], sql` and `);
}

/**
 * Trigram similarity on accent-folded text (migration 0007), best first: the title, 0.7 × the start of the body,
 * and across languages the English title pivots (content_translations "en:title") of the item and of the query.
 * `cols` are the columns to select next to `score`.
 */
export function trigramSimilarQuery(opts: { cols: SQL; where: SQL; text: string; pivot?: string | null; minScore: number; limit: number }): SQL {
  const q = opts.text.slice(0, 500);
  const pv = opts.pivot?.slice(0, 500) || null;
  return sql`
    select * from (
      select ${opts.cols}, round(greatest(word_similarity(ozvi_fold(${q}), ozvi_fold(${items.title})),
                                     0.7 * word_similarity(ozvi_fold(${q}), ozvi_fold(left(${items.body}, 1000))),
                                     coalesce(word_similarity(ozvi_fold(${q}), ozvi_fold(t.title)), 0),
                                     coalesce(word_similarity(ozvi_fold(${pv}), ozvi_fold(${items.title})), 0),
                                     coalesce(word_similarity(ozvi_fold(${pv}), ozvi_fold(t.title)), 0))::numeric, 3)::float as score
      from ${items}
      left join content_translations t on t.subject_id = ${items.id} and t.target_locale = 'en:title'
        and t.source_hash = encode(sha256(convert_to(${items.title}, 'UTF8')), 'hex')
      where ${opts.where}
    ) s where score >= ${opts.minScore}
    order by score desc, votes desc limit ${opts.limit}`;
}

/** An OpenAI-compatible embeddings endpoint (OpenAI, Ollama, LM Studio, vLLM…). */
export interface ApiEmbeddings { url: string; model: string; key?: string }

export async function embedApi(cfg: ApiEmbeddings, input: string[], timeoutMs = 20_000): Promise<number[][]> {
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

/** Cosine similarity (1 = same direction); 0 for empty or zero vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
