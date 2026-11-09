import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";

/** RFC 8058 one-click unsubscribe from mail clients (Gmail, Apple Mail). POST only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(u) || !verifyUnsubscribe(u, s)) return new Response("Invalid", { status: 400 });
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
  if (!project) return new Response("Not found", { status: 404 });
  await withProject(db, project.id, (tx) => tx.update(schema.users).set({ emailOptOut: true }).where(eq(schema.users.id, u)));
  return new Response("OK");
}
