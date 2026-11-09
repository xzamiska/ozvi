import { createOzviMcpServer } from "@ozvi/mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NextRequest } from "next/server";
import { clientIp } from "./client-ip";
import { mcpBackend } from "./mcp-backend";
import { allow } from "./ratelimit";
import { authenticateToken, parseLockdown } from "./tokens";

/**
 * MCP over Streamable HTTP, stateless: every request authenticates its token and gets a fresh
 * server, so any replica can answer. /mcp takes personal tokens for any project; /<slug>/mcp is
 * the OAuth resource for one project (401 points clients at its metadata).
 */
export async function handleMcp(req: NextRequest, slug?: string, origin?: string) {
  const unauthorized = () => Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: "Missing or invalid token. Connect via OAuth, or create a token in Ozvi → Moje API tokeny and send it as Authorization: Bearer ozvi_pat_…" }, id: null },
    { status: 401, headers: { "www-authenticate": slug && origin
      ? `Bearer realm="ozvi", resource_metadata="${origin}/.well-known/oauth-protected-resource/${slug}/mcp"`
      : 'Bearer realm="ozvi"' } },
  );
  if (!allow("mcpIp", clientIp(req.headers))) return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests" }, id: null }, { status: 429 });
  const auth = await authenticateToken(req.headers.get("authorization"));
  // Audience: a project token only works for its project; an OAuth token only on /<slug>/mcp, the resource it was issued for.
  if (!auth || (slug ? auth.project.slug !== slug : auth.oauth)) return unauthorized();
  if (!allow("mcp", auth.tokenId)) return Response.json({ jsonrpc: "2.0", error: { code: -32000, message: "Too many requests for this token" }, id: null }, { status: 429 });
  const lockdown = parseLockdown(req.headers.get("x-ozvi-lockdown") ?? req.nextUrl.searchParams.get("lockdown"));
  const server = createOzviMcpServer(await mcpBackend({ ...auth, lockdown }));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close();
  }
}
