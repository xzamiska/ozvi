import type { NextRequest } from "next/server";
import { slugForHost } from "@/lib/domains";

/**
 * Caddy on-demand TLS "ask" endpoint: 200 = issue a certificate for ?domain=, anything else = refuse.
 * Only verified custom domains and existing cloud subdomains qualify, so nobody can make us
 * request certificates for arbitrary names.
 */
export async function GET(req: NextRequest) {
  const domain = (req.nextUrl.searchParams.get("domain") ?? "").toLowerCase();
  return new Response(null, { status: domain && (await slugForHost(domain)) ? 200 : 404 });
}
