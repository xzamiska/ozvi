import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getJira, handleJiraEvent, verifyJira } from "@/lib/jira";

/** Jira Cloud webhook (issue updated/deleted). Secret from admin → Integrácie (X-Hub-Signature: sha256=…). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return new Response("unknown project", { status: 404 });
  const body = await req.text();
  if (body.length > 2_000_000) return new Response("too large", { status: 413 });
  try {
    const r = await withProject(db, project.id, async (tx) => {
      const j = await getJira(tx);
      if (!j?.webhookSecret) return { status: 404, text: "jira not connected" };
      if (!verifyJira(j.webhookSecret, body, req.headers.get("x-hub-signature"))) return { status: 401, text: "bad signature" };
      return { status: 200, text: String(await handleJiraEvent(tx, project, j, JSON.parse(body))) };
    });
    return new Response(r.text, { status: r.status });
  } catch (e) {
    console.error("[ozvi] jira webhook", e);
    return new Response("error", { status: 500 });
  }
}
