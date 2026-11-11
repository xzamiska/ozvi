import { primaryHost } from "@/lib/domains";
import { robotsTxt } from "@/lib/indexing";
import { publicUrl } from "@/lib/email/url";

export const dynamic = "force-dynamic";

/** Per host: the cloud's own site keeps the app out, board hosts rely on the noindex header (ADR-0010). */
export function GET(req: Request) {
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  return new Response(robotsTxt({ cloud: process.env.OZVI_MODE === "cloud", primary: host === primaryHost(), origin: publicUrl() }), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
