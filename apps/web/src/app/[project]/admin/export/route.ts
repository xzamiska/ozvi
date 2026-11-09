import type { NextRequest } from "next/server";
import { exportProject } from "@/lib/privacy";
import { getCtx } from "@/lib/project";

/** Whole project as JSON (data portability; attachments listed, files themselves stay in storage). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user } = await getCtx(slug);
  if (user?.role !== "admin") return new Response("Len pre admina.", { status: 403 });
  return new Response(JSON.stringify(await exportProject(project), null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${slug}-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" },
  });
}
