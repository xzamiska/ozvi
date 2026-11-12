import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requestOrigin } from "@/lib/email/url";
import { finishGithubInstall } from "@/lib/integration-actions";

/** Back from GitHub with a ticket (lib/github-app step 3): store the installation, then show settings. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  const url = new URL(req.url);
  const ticket = url.searchParams.get("ticket");
  const back = url.searchParams.get("github");
  let result = back === "requested" || back === "none" ? back : "failed";
  if (ticket) result = await finishGithubInstall(slug, ticket).then((r) => (r === "ok" ? "connected" : "failed"), () => "failed");
  return Response.redirect(new URL(`/${slug}/admin?github=${result}#github`, requestOrigin(project, req)), 303);
}
