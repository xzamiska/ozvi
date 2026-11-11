import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyGithubSignature } from "@/lib/github";
import { runGithubEvent } from "@/lib/github-webhook";

/**
 * GitHub webhook for a board connected with a token (issues, pull_request, release), signed with
 * the secret shown in admin → Integrations. Boards connected through the GitHub App get their
 * events at /api/github/app instead.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return new Response("unknown project", { status: 404 });
  const body = await req.text();
  if (body.length > 2_000_000) return new Response("too large", { status: 413 });
  try {
    const r = await runGithubEvent(project, req.headers.get("x-github-event") ?? "", JSON.parse(body), (g) =>
      g.config.installationId || !g.webhookSecret ? { status: 404, text: "github not connected with a token" }
        : verifyGithubSignature(g.webhookSecret, body, req.headers.get("x-hub-signature-256")) ? null : { status: 401, text: "bad signature" });
    return new Response(r.text, { status: r.status });
  } catch (e) {
    console.error("[ozvi] github webhook", e);
    return new Response("error", { status: 500 });
  }
}
