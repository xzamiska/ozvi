import type { NextRequest } from "next/server";
import { resourceMetadata } from "@/lib/oauth-meta";

/** /.well-known/oauth-protected-resource/<slug>/mcp */
export async function GET(req: NextRequest, { params }: { params: Promise<{ rest: string[] }> }) {
  const { rest } = await params;
  if (rest.length !== 2 || rest[1] !== "mcp") return new Response("not found", { status: 404 });
  return resourceMetadata(req, rest[0]!);
}
