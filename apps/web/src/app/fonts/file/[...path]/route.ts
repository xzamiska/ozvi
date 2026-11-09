import { fontFile } from "@/lib/fonts-store";

/** woff2 files referenced by /fonts/css. Paths are versioned by Google, so they are cached forever. */
export async function GET(_: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const bytes = await fontFile((await params).path.join("/"));
  if (!bytes) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" } });
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "font/woff2",
      "content-length": String(bytes.length),
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
