import { publicUrl } from "@/lib/email/url";
import { cloudOnly } from "@/lib/legal";
import { releaseFeed, releaseNotes } from "@/lib/releases";

export const dynamic = "force-dynamic";

/** Public release list for the self-host update check (lib/version.ts) and ozvi-updater. Served by ozvi.io only. */
export async function GET() {
  if (!cloudOnly()) return new Response(null, { status: 404 });
  return Response.json(releaseFeed(await releaseNotes(), publicUrl()), {
    headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
  });
}
