import { FALLBACK_CSS, parseFontQuery } from "@/lib/fonts";
import { allowedFamilies, fontCss } from "@/lib/fonts-store";

/**
 * First-party font stylesheet: /fonts/css?family=Inter&wght=400,500,600,700. Only allowed families
 * (catalogue + families saved in a project theme). Never fails the page: unknown or unavailable fonts get an
 * empty stylesheet, so the theme's system font stack takes over.
 */
export async function GET(req: Request) {
  const allowed = await allowedFamilies();
  const q = parseFontQuery(new URL(req.url).searchParams, (f) => allowed.has(f));
  const headers: Record<string, string> = {
    "content-type": "text/css; charset=utf-8",
    "access-control-allow-origin": "*",
    "x-content-type-options": "nosniff",
  };
  // 200, not 404: a font outside the allow-list must not raise console errors on a board; it just stays system.
  if (!q) return new Response(FALLBACK_CSS, { headers: { ...headers, "cache-control": "public, max-age=300" } });
  const { css, complete } = await fontCss(q);
  headers["cache-control"] = complete ? "public, max-age=31536000, immutable" : "public, max-age=60";
  return new Response(css, { headers });
}
