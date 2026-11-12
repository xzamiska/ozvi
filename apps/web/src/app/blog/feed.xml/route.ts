import { BLOG_POSTS } from "@/lib/blog";
import { publicUrl } from "@/lib/email/url";
import { cloudOnly } from "@/lib/legal";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

/** RSS 2.0 of ozvi.io/blog; dev.to and Hashnode import it and keep ozvi.io as the canonical address. */
export function GET() {
  if (!cloudOnly()) return new Response("Not found", { status: 404 });
  const base = publicUrl();
  const items = BLOG_POSTS.map((p) => `<item><title>${esc(p.title)}</title><link>${base}/blog/${p.slug}</link><guid isPermaLink="true">${base}/blog/${p.slug}</guid>`
    + `<pubDate>${new Date(`${p.date}T09:00:00Z`).toUTCString()}</pubDate><description>${esc(p.description)}</description>${p.tags.map((t) => `<category>${esc(t)}</category>`).join("")}</item>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Ozvi blog</title><link>${base}/blog</link>`
    + `<description>Bug reports, feedback boards and release notes, from the people who build Ozvi.</description><language>en</language>${items}</channel></rss>\n`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
