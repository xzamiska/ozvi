import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { installationOf, verifyGithubSignature } from "@/lib/github";
import { forgetInstallation, githubApp } from "@/lib/github-app";
import { runGithubEvent } from "@/lib/github-webhook";

/**
 * The GitHub App's one webhook. The installation id finds the boards (a column on projects, which
 * has no RLS); each board then handles the event in its own scope, only for its own repository.
 */
export async function POST(req: NextRequest) {
  const app = githubApp();
  if (!app) return new Response("github app not configured", { status: 404 });
  const body = await req.text();
  if (body.length > 2_000_000) return new Response("too large", { status: 413 });
  if (!verifyGithubSignature(app.webhookSecret, body, req.headers.get("x-hub-signature-256"))) return new Response("bad signature", { status: 401 });
  const event = req.headers.get("x-github-event") ?? "";
  const payload = JSON.parse(body) as { action?: string; installation?: { id?: number }; repository?: { full_name?: string } };
  const installationId = Number(payload.installation?.id);
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return new Response("no installation", { status: 200 });
  const boards = await db.select().from(schema.projects).where(eq(schema.projects.githubInstallationId, installationId));

  try {
    // Uninstalled or suspended on GitHub: the boards lose the connection (links on items stay).
    if (event === "installation" && (payload.action === "deleted" || payload.action === "suspend")) {
      forgetInstallation(installationId);
      for (const p of boards) {
        await withProject(db, p.id, async (tx) => {
          const row = await tx.query.integrations.findFirst({ where: eq(schema.integrations.provider, "github") });
          if (row && installationOf(row.config) === installationId) await tx.delete(schema.integrations).where(eq(schema.integrations.id, row.id));
        });
      }
      await db.update(schema.projects).set({ githubInstallationId: null }).where(eq(schema.projects.githubInstallationId, installationId));
      return new Response(`disconnected ${boards.length}`, { status: 200 });
    }
    const repo = payload.repository?.full_name;
    if (!repo) return new Response("ignored", { status: 200 });
    const out: string[] = [];
    for (const p of boards) {
      const r = await runGithubEvent(p, event, payload, (g) => (g.config.installationId === installationId && g.config.repo.toLowerCase() === repo.toLowerCase() ? null : { status: 200, text: "other repository" }));
      out.push(`${p.slug}: ${r.text}`);
    }
    return new Response(out.join("\n") || "no board", { status: 200 });
  } catch (e) {
    console.error("[ozvi] github app webhook", e);
    return new Response("error", { status: 500 });
  }
}
