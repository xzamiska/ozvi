import { LOCALES } from "@/i18n/locales";
import { COMPARE_IDS, compareLanguages } from "@/lib/compare";
import { primaryHost } from "@/lib/domains";
import { publicUrl } from "@/lib/email/url";
import { SITEMAP_PAGES } from "@/lib/indexing";
import { LANDING_PATH } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Ozvi's own public pages (cloud, primary host only); the landing and the comparison pages with their language versions. Boards never. */
export function GET(req: Request) {
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (process.env.OZVI_MODE !== "cloud" || host !== primaryHost()) return new Response("Not found", { status: 404 });
  const base = publicUrl();
  const alt = LOCALES.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${base}${LANDING_PATH[l]}"/>`).join("")
    + `<xhtml:link rel="alternate" hreflang="x-default" href="${base}/"/>`;
  const landing = LOCALES.map((l) => `<url><loc>${base}${LANDING_PATH[l]}</loc>${alt}<changefreq>weekly</changefreq><priority>${l === "sk" ? "1.0" : "0.9"}</priority></url>`);
  const pages = SITEMAP_PAGES.map((p) => `<url><loc>${base}${p}</loc><changefreq>${p === "/releases" ? "weekly" : "monthly"}</changefreq><priority>${p === "/demo" ? "0.8" : "0.5"}</priority></url>`);
  // Comparison pages: each language its own URL, both carrying the sk/en pair and x-default.
  const compare = COMPARE_IDS.flatMap((id) => {
    const langs = Object.entries(compareLanguages(id));
    const links = langs.map(([l, p]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${base}${p}"/>`).join("");
    return langs.filter(([l]) => l !== "x-default").map(([, p]) => `<url><loc>${base}${p}</loc>${links}<changefreq>monthly</changefreq><priority>0.7</priority></url>`);
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${[...landing, ...pages, ...compare].join("")}</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
