import { schema, withProject, type PlanName } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { aiAvailable } from "./ai";
import { db } from "./db";
import { getGithub, handleGithubEvent, type Github } from "./github";
import type { Project } from "./project";
import { enrichReleaseDraft } from "./release";

/**
 * One GitHub event for one board, inside the board's RLS scope. `check` runs with the board's
 * GitHub connection first (signature, repository) and may stop it with a status and text.
 */
export async function runGithubEvent(project: Project, event: string, payload: unknown,
  check: (g: Github) => { status: number; text: string } | null): Promise<{ status: number; text: string }> {
  const [ws] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, project.workspaceId));
  const ai = aiAvailable((ws?.plan ?? "self") as PlanName);
  const drafts: { id: string; notes: string }[] = [];
  const result = await withProject(db, project.id, async (tx) => {
    const g = await getGithub(tx);
    if (!g) return { status: 404, text: "github not connected" };
    const stop = check(g);
    if (stop) return stop;
    return { status: 200, text: await handleGithubEvent(tx, project, g, event, payload, { ai, onDraft: (id, notes) => drafts.push({ id, notes }) }) };
  });
  // The release draft is committed; the AI rewrite runs after the response (GitHub waits only 10 s).
  for (const d of drafts) after(() => enrichReleaseDraft(db, project, d.id, d.notes).catch((e) => console.error("[ozvi] release draft", e)));
  return result;
}
