import { schema } from "@ozvi/db";
import { onAccent, parseTheme, presets, renderedPalettes } from "@ozvi/theme";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { letterIcon } from "@/lib/favicon";
import { storage } from "@/lib/storage";

/**
 * The board's favicon (lib/favicon.ts): the stored icon, or the board's first letter in its accent
 * colour. Public like the board's look; `?v=<key>` from the layout makes it cacheable for good.
 * SVGs are served under a CSP that runs nothing, so an uploaded SVG cannot script our origin.
 */
const HEADERS = { "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };

export async function GET(req: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const [p] = await db.select({ name: schema.projects.name, theme: schema.projects.theme, key: schema.projects.faviconKey, type: schema.projects.faviconType })
    .from(schema.projects).where(eq(schema.projects.slug, slug)).limit(1);
  if (!p) return new Response(null, { status: 404 });
  const versioned = new URL(req.url).searchParams.has("v");
  const cache = versioned ? "public, max-age=31536000, immutable" : "public, max-age=3600";
  if (p.key && p.type) {
    const body = await storage().get(p.key).catch(() => null);
    if (body) return new Response(body as unknown as BodyInit, { headers: { ...HEADERS, "content-type": p.type, "cache-control": cache } });
  }
  let theme;
  try { theme = parseTheme(p.theme); } catch { theme = parseTheme(presets.ozvi); }
  const accent = renderedPalettes(theme).light.accent;
  return new Response(letterIcon(p.name, accent, onAccent(accent)), { headers: { ...HEADERS, "content-type": "image/svg+xml", "cache-control": cache } });
}
