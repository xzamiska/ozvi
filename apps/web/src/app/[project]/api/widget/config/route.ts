import { schema } from "@ozvi/db";
import { fontsHref, parseTheme, presets, toCss } from "@ozvi/theme";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { enabledSections } from "@/lib/sections";
import { ownOrigins } from "@/lib/widget-api";
import { writeAllowed } from "@/lib/widget-rules";

/**
 * Public, cacheable: everything the widget needs to look like the host product. `allowed` says whether the
 * requesting page's origin may send reports and votes, so the widget can explain it up front instead of
 * failing on a preflight without CORS headers after the person typed a report.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const p = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!p) return Response.json({ error: "not_found" }, { status: 404, headers: { "access-control-allow-origin": "*" } });
  let theme;
  try { theme = parseTheme(p.theme); } catch { theme = parseTheme(presets.ozvi); }
  const allowed = writeAllowed(p.allowedOrigins, ownOrigins(p, req), req.headers.get("origin"));
  return Response.json(
    { name: p.name, css: toCss(theme, ":host"), fonts: fontsHref(theme), ideasPublic: p.ideasPublic, sections: enabledSections(p), allowed },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300", vary: "Origin" } },
  );
}
