import { schema } from "@ozvi/db";
import { fontsHref, parseTheme, presets, toCss } from "@ozvi/theme";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { enabledSections } from "@/lib/sections";

/** Public, cacheable: everything the widget needs to look like the host product. */
export async function GET(_: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const p = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!p) return Response.json({ error: "not_found" }, { status: 404, headers: { "access-control-allow-origin": "*" } });
  let theme;
  try { theme = parseTheme(p.theme); } catch { theme = parseTheme(presets.ozvi); }
  return Response.json(
    { name: p.name, css: toCss(theme, ":host"), fonts: fontsHref(theme), ideasPublic: p.ideasPublic, sections: enabledSections(p) },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" } },
  );
}
