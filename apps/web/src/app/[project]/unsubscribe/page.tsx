import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { AuthShell } from "@/components/EmailLogin";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";
import { getCtx } from "@/lib/project";
import { getTranslations } from "next-intl/server";
import { boardTitle } from "@/lib/board-meta";

export const generateMetadata = boardTitle("boardAuth", "unsubTitle");

/** Two steps (GET shows a button, POST unsubscribes) so mail scanners that open links don't unsubscribe people. */
export default async function Unsubscribe({ params, searchParams }: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ u?: string; s?: string; done?: string }>;
}) {
  const { project: slug } = await params;
  const { u = "", s = "", done } = await searchParams;
  const { project } = await getCtx(slug);
  const m = await getTranslations("boardAuth");
  const valid = /^[0-9a-f-]{36}$/.test(u) && verifyUnsubscribe(u, s);

  async function unsubscribe() {
    "use server";
    if (!valid) return;
    await withProject(db, project.id, (tx) => tx.update(schema.users).set({ emailOptOut: true }).where(eq(schema.users.id, u)));
    const { redirect } = await import("next/navigation");
    redirect(`/${slug}/unsubscribe?u=${u}&s=${s}&done=1`);
  }

  if (!valid) {
    return <AuthShell title={m("unsubInvalidTitle")} lede={m("unsubInvalidLede")} />;
  }
  if (done) {
    return (
      <AuthShell title={m("unsubDoneTitle")} lede={m("unsubDoneLede")}>
        <Button asChild variant="outline" size="lg" className="w-full"><Link href={`/${slug}/ideas`}>{m("backToFeedback")}</Link></Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={m("unsubTitle")} lede={m("unsubLede", { project: project.name })}>
      <form action={unsubscribe}>
        <Button type="submit" size="lg" className="w-full">{m("unsubButton")}</Button>
      </form>
    </AuthShell>
  );
}
