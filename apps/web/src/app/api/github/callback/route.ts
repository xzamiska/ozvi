import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { projectOrigin } from "@/lib/email/url";
import { githubApp, installerRepos, installTicket, readInstallState } from "@/lib/github-app";

/**
 * Where GitHub sends the admin after installing the app (step 2 in lib/github-app). It reaches the
 * main host, so it only proves the installation and hands the board a ticket; the board stores it.
 */
export async function GET(req: NextRequest) {
  const app = githubApp();
  const url = new URL(req.url);
  const state = readInstallState(url.searchParams.get("state"));
  const installationId = Number(url.searchParams.get("installation_id"));
  const code = url.searchParams.get("code");
  if (!app || !state) return new Response("This link has expired. Start again in your board's settings → Integrations → GitHub.", { status: 400 });
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, state.p) });
  if (!project) return new Response("unknown project", { status: 404 });
  const back = (q: string) => Response.redirect(`${projectOrigin(project)}/${project.slug}/admin/github?${q}#github`, 303);
  // An organisation owner still has to approve the request; nothing to connect yet.
  if (url.searchParams.get("setup_action") === "request") return back("github=requested");
  if (!Number.isSafeInteger(installationId) || installationId <= 0 || !code) return back("github=failed");
  const repos = await installerRepos(app, code, installationId).catch((e) => { console.error("[ozvi] github callback", e); return null; });
  if (!repos) return back("github=failed");
  return back(`ticket=${encodeURIComponent(installTicket({ p: project.id, u: state.u, i: installationId, r: repos }))}`);
}
