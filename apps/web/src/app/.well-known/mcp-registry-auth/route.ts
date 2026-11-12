import { primaryHost } from "@/lib/domains";

export const dynamic = "force-dynamic";

/**
 * Proof for the official MCP Registry that ozvi.io owns the `io.ozvi/*` namespace (HTTP domain auth):
 * the PUBLIC half of an Ed25519 key; the private key stays with the owner and is used by mcp-publisher.
 * Cloud, primary host only: self-hosted instances and custom board domains answer 404.
 */
const PROOF = "v=MCPv1; k=ed25519; p=WVvz7BbyDEWgaMO/c1N9WguEOckIyFmRIdeX/+MpBGE=";

export function GET(req: Request) {
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  if (process.env.OZVI_MODE !== "cloud" || host !== primaryHost()) return new Response("Not found", { status: 404 });
  return new Response(`${PROOF}\n`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
