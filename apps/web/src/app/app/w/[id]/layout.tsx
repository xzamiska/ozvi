import Script from "next/script";
import { ownFeedback } from "@/lib/own-feedback";
import { OZVI_VERSION } from "@/lib/version";
import { schema, withProject } from "@ozvi/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ConsoleShell } from "@/components/ozvi/ConsoleNav";
import { getAccount } from "@/lib/account";
import { consoleWorkspace } from "@/lib/console";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Failed e-mails and webhook calls of the last 7 days: the badge on "Doručovanie". */
async function recentFailures(projectIds: string[]) {
  const since = new Date(Date.now() - 7 * 86_400_000);
  let n = 0;
  for (const id of projectIds) {
    n += await withProject(db, id, async (tx) => {
      const [m] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.emails)
        .where(and(eq(schema.emails.status, "failed"), gte(schema.emails.createdAt, since)));
      const [h] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.webhookDeliveries)
        .where(and(inArray(schema.webhookDeliveries.status, ["failed"]), gte(schema.webhookDeliveries.createdAt, since)));
      return (m?.n ?? 0) + (h?.n ?? 0);
    });
  }
  return n;
}

export default async function ConsoleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = await consoleWorkspace(account.id, id);
  if (!ws) notFound();
  const cloud = process.env.OZVI_MODE === "cloud";
  const failures = await recentFailures(ws.projects.map((p) => p.id));
  const own = await ownFeedback();

  return (
    <ConsoleShell ws={{ id: ws.id, name: ws.name, plan: ws.plan }} all={ws.all} projects={ws.projects.map((p) => ({ slug: p.slug, name: p.name }))}
      account={{ name: account.name, email: account.email }} cloud={cloud} attention={{ delivery: failures, plan: ws.planStatus === "past_due" }}>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1120px] px-4 pt-6 pb-20 md:px-10 md:pt-10">{children}</main>
      {own && <>
        {/* Ozvi's own feedback widget: the console is a host app like any other (lib/own-feedback.ts). */}
        {/* @ts-expect-error custom element */}
        <ozvi-widget project={own.project.slug} token-url="/app/api/feedback-token" app-version={OZVI_VERSION} />
        <Script src="/widget.js" strategy="afterInteractive" />
      </>}
    </ConsoleShell>
  );
}
