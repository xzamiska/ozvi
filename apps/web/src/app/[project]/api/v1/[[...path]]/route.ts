import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { handleApi } from "@/lib/api/handler";
import { problemBody, ApiProblem } from "@/lib/api/problem";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/email/url";

/** Public REST API v1: /<slug>/api/v1/… (docs: /docs/api, spec: /<slug>/api/v1/openapi.json). */
export const dynamic = "force-dynamic";

async function handle(req: NextRequest, { params }: { params: Promise<{ project: string; path?: string[] }> }) {
  const { project: slug, path = [] } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) {
    return Response.json(problemBody(new ApiProblem("not_found", "No such project."), req.nextUrl.pathname),
      { status: 404, headers: { "content-type": "application/problem+json" } });
  }
  return handleApi(req, slug, path, requestOrigin(project, req));
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as HEAD, handle as PUT };
