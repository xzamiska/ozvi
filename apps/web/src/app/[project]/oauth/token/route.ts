import type { NextRequest } from "next/server";
import { exchangeCode, OAuthError, refresh } from "@/lib/oauth";
import { requestOrigin } from "@/lib/email/url";
import { projectFor } from "@/lib/oauth-meta";
import { resourceMatches } from "@/lib/oauth-uri";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST", "cache-control": "no-store" };
export const OPTIONS = () => new Response(null, { status: 204, headers: cors });

export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const project = await projectFor((await params).project);
  if (!project) return Response.json({ error: "invalid_request" }, { status: 404, headers: cors });
  let p: URLSearchParams;
  try {
    const ct = req.headers.get("content-type") ?? "";
    p = ct.includes("application/json") ? new URLSearchParams(Object.entries(await req.json()).map(([k, v]) => [k, String(v)])) : new URLSearchParams(await req.text());
  } catch { return Response.json({ error: "invalid_request" }, { status: 400, headers: cors }); }
  // RFC 8707: a token can only be for this project's MCP server.
  if (!resourceMatches(p.get("resource"), requestOrigin(project, req), project.slug)) {
    return Response.json({ error: "invalid_target", error_description: "resource must be this board's MCP server" }, { status: 400, headers: cors });
  }
  try {
    const grant = p.get("grant_type");
    if (grant === "authorization_code") return Response.json(await exchangeCode(project, p), { headers: cors });
    if (grant === "refresh_token") return Response.json(await refresh(project, p), { headers: cors });
    return Response.json({ error: "unsupported_grant_type" }, { status: 400, headers: cors });
  } catch (e) {
    if (e instanceof OAuthError) return Response.json({ error: e.code, error_description: e.message }, { status: e.status, headers: cors });
    throw e;
  }
}
