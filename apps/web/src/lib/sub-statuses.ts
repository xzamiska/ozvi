import { schema, type Tx } from "@ozvi/db";
import { asc, eq, inArray, notInArray } from "drizzle-orm";
import { boardLocales, type BoardLanguages } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { fail } from "./domain";
import type { Kind } from "./route";
import { cleanLabels, isStage, parseStatusLabels, SUBS_PER_STAGE, subLabel, type StatusLabels, type SubStatus } from "./statuses";

/** Custom sub-statuses in the database (see statuses.ts for the rules). */

const { customStatuses, projects } = schema;

export async function listSubStatuses(tx: Tx): Promise<SubStatus[]> {
  const rows = await tx.select().from(customStatuses).orderBy(asc(customStatuses.kind), asc(customStatuses.stage), asc(customStatuses.position), asc(customStatuses.createdAt));
  return rows.map((r) => ({ id: r.id, kind: r.kind, stage: r.stage, labels: cleanLabels(r.labels), position: r.position }));
}

/** id → label in this locale (default-locale fallback), for rows and timelines. */
export async function subLabelMap(tx: Tx, board: BoardLanguages, locale: Locale): Promise<Map<string, string>> {
  const fallback = boardLocales(board).fallback;
  return new Map((await listSubStatuses(tx)).map((s) => [s.id, subLabel(s, locale, fallback)]));
}

export interface StatusesInput {
  labels: unknown;
  subs: { id?: unknown; kind: unknown; stage: unknown; labels: unknown }[];
}

/**
 * Admin: save stage renames and the full list of sub-statuses at once. Subs missing from the list are
 * deleted (their items fall back to the plain stage); a sub never moves to another stage or kind.
 */
export async function saveStatuses(tx: Tx, projectId: string, input: StatusesInput): Promise<{ labels: StatusLabels; subs: number }> {
  const labels = parseStatusLabels(input.labels);
  if (!Array.isArray(input.subs) || input.subs.length > 60) throw fail((t) => t("subInvalid"));
  const existing = await listSubStatuses(tx);
  const byId = new Map(existing.map((s) => [s.id, s]));
  const perStage = new Map<string, number>();
  const clean = input.subs.map((raw) => {
    const kind = raw.kind === "bug" ? "bug" : raw.kind === "idea" ? "idea" : null;
    const stage = typeof raw.stage === "string" ? raw.stage : "";
    if (!kind || !isStage(kind, stage)) throw fail((t) => t("subInvalid"));
    const l = cleanLabels(raw.labels);
    if (Object.keys(l).length === 0) throw fail((t) => t("subName"));
    const id = typeof raw.id === "string" && byId.has(raw.id) ? raw.id : null;
    if (id && (byId.get(id)!.kind !== kind || byId.get(id)!.stage !== stage)) throw fail((t) => t("subInvalid"));
    const key = `${kind}:${stage}`;
    const position = perStage.get(key) ?? 0;
    if (position >= SUBS_PER_STAGE) throw fail((t) => t("subTooMany", { n: SUBS_PER_STAGE }));
    perStage.set(key, position + 1);
    return { id, kind: kind as Kind, stage, labels: l, position };
  });
  const keep = clean.map((c) => c.id).filter((x): x is string => !!x);
  // Items on a removed sub-status drop back to the plain stage (FK on delete set null).
  await tx.delete(customStatuses).where(keep.length ? notInArray(customStatuses.id, keep) : undefined);
  for (const c of clean) {
    if (c.id) await tx.update(customStatuses).set({ labels: c.labels, position: c.position }).where(eq(customStatuses.id, c.id));
    else await tx.insert(customStatuses).values({ projectId, kind: c.kind, stage: c.stage as "open", labels: c.labels, position: c.position });
  }
  await tx.update(projects).set({ statusLabels: labels }).where(eq(projects.id, projectId));
  return { labels, subs: clean.length };
}

/** Sub-statuses by id, only those that exist in this project (RLS) — for validating input. */
export async function subsById(tx: Tx, ids: string[]) {
  if (ids.length === 0) return new Map<string, SubStatus>();
  const rows = await tx.select().from(customStatuses).where(inArray(customStatuses.id, ids));
  return new Map(rows.map((r) => [r.id, { id: r.id, kind: r.kind, stage: r.stage, labels: cleanLabels(r.labels), position: r.position } as SubStatus]));
}
