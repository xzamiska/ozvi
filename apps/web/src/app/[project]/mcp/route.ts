import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/email/url";
import { handleMcp } from "@/lib/mcp-handler";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return new Response("unknown project", { status: 404 });
  return handleMcp(req, slug, requestOrigin(project, req));
}
export { handle as GET, handle as POST, handle as DELETE };
