import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getLinear, handleLinearEvent, verifyLinear } from "@/lib/linear";

/** Linear webhook (Issue events). Signed with the secret from admin → Integrácie (Linear-Signature). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return new Response("unknown project", { status: 404 });
  const body = await req.text();
  if (body.length > 1_000_000) return new Response("too large", { status: 413 });
  try {
    const r = await withProject(db, project.id, async (tx) => {
      const lin = await getLinear(tx);
      if (!lin?.webhookSecret) return { status: 404, text: "linear not connected" };
      if (!verifyLinear(lin.webhookSecret, body, req.headers.get("linear-signature"))) return { status: 401, text: "bad signature" };
      return { status: 200, text: String(await handleLinearEvent(tx, project, lin, JSON.parse(body))) };
    });
    return new Response(r.text, { status: r.status });
  } catch (e) {
    console.error("[ozvi] linear webhook", e);
    return new Response("error", { status: 500 });
  }
}
