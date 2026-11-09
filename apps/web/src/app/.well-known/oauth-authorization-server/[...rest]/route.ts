import type { NextRequest } from "next/server";
import { asMetadata } from "@/lib/oauth-meta";

/** /.well-known/oauth-authorization-server/<slug> (RFC 8414 path insertion) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  if (rest.length !== 1) return new Response("not found", { status: 404 });
  return asMetadata(req, rest[0]!);
}
