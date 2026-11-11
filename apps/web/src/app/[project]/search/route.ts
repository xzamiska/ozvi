import { schema, withProject } from "@ozvi/db";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/project";
import { PIVOT, pivotQuery } from "@/lib/translate";
import { sectionOn } from "@/lib/sections";

const words = (q: string) => q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3).slice(0, 6);
const esc = (w: string) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Similar ideas while typing a new one (dedupe before it happens). Bugs are never searchable here.
 * Across languages too: on boards with post translation, existing ideas have English title pivots
 * (lib/translate.ts pivotPending) and a typed title in another language gets one, so "Eksport do CSV"
 * finds "Export do CSV" and "CSV export".
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user, plan } = await getCtx(slug);
  if ((!project.ideasPublic && !user) || !sectionOn(project, "ideas")) return Response.json([]);
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const typed = words(q);
  if (typed.length === 0) return Response.json([]);
  const pivot = await pivotQuery(q, { project, plan, rateKey: user?.id ?? clientIp(req.headers) });
  const all = [...new Set([...typed, ...(pivot ? words(pivot) : [])])].slice(0, 12);
  const { items, contentTranslations: ct } = schema;
  const rows = await withProject(db, project.id, (tx) =>
    tx.select({ number: items.number, title: items.title, votes: items.voteCount, status: items.status })
      .from(items)
      .leftJoin(ct, and(eq(ct.subjectId, items.id), eq(ct.targetLocale, PIVOT), sql`${ct.sourceHash} = encode(sha256(convert_to(${items.title}, 'UTF8')), 'hex')`))
      .where(and(eq(items.kind, "idea"), isNull(items.mergedIntoId), isNull(items.deletedAt), eq(items.pending, false),
        or(...all.flatMap((w) => [ilike(items.title, esc(w)), ilike(ct.title, esc(w))]))))
      .orderBy(desc(items.voteCount)).limit(5));
  return Response.json(rows);
}
