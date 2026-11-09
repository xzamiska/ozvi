import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { OAuthError, registerClient } from "@/lib/oauth";
import { projectFor } from "@/lib/oauth-meta";
import { allow } from "@/lib/ratelimit";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST" };
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });

/**
 * Legacy: RFC 7591 dynamic client registration (public clients). Deprecated by the MCP
 * authorization spec 2026-07-28 in favour of Client ID Metadata Documents, which we also accept
 * (client_id_metadata_document_supported); kept for existing clients and clients without CIMD.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const project = await projectFor((await params).project);
  if (!project) return Response.json({ error: "not_found" }, { status: 404, headers: cors });
  if (!allow("signup", `oauth:${clientIp(req.headers)}`)) return Response.json({ error: "slow_down" }, { status: 429, headers: cors });
  try {
    return Response.json(await registerClient(project, await req.json()), { status: 201, headers: cors });
  } catch (e) {
    if (e instanceof OAuthError) return Response.json({ error: e.code, error_description: e.message }, { status: e.status, headers: cors });
    if (e instanceof SyntaxError) return Response.json({ error: "invalid_client_metadata" }, { status: 400, headers: cors });
    throw e;
  }
}
