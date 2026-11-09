import { schema, withProject, type PlanName } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { after, type NextRequest } from "next/server";
import { aiAvailable } from "@/lib/ai";
import { db } from "@/lib/db";
import { getGithub, handleGithubEvent, verifyGithubSignature } from "@/lib/github";
import { enrichReleaseDraft } from "@/lib/release";

/** GitHub webhook (issues, pull_request, release). Signed with the secret shown in admin → Integrácie. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return new Response("unknown project", { status: 404 });
  const body = await req.text();
  if (body.length > 2_000_000) return new Response("too large", { status: 413 });
  const event = req.headers.get("x-github-event") ?? "";
  const [ws] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, project.workspaceId));
  const ai = aiAvailable((ws?.plan ?? "self") as PlanName);
  const drafts: { id: string; notes: string }[] = [];
  try {
    const result = await withProject(db, project.id, async (tx) => {
      const g = await getGithub(tx);
      if (!g?.webhookSecret) return { status: 404, text: "github not connected" };
      if (!verifyGithubSignature(g.webhookSecret, body, req.headers.get("x-hub-signature-256"))) return { status: 401, text: "bad signature" };
      return { status: 200, text: await handleGithubEvent(tx, project, g, event, JSON.parse(body), { ai, onDraft: (id, notes) => drafts.push({ id, notes }) }) };
    });
    // The release draft is committed; the AI rewrite runs after the response (GitHub waits only 10 s).
    for (const d of drafts) after(() => enrichReleaseDraft(db, project, d.id, d.notes).catch((e) => console.error("[ozvi] release draft", e)));
    return new Response(result.text, { status: result.status });
  } catch (e) {
    console.error("[ozvi] github webhook", e);
    return new Response("error", { status: 500 });
  }
}
