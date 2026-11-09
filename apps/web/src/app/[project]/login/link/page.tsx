import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthShell } from "@/components/EmailLogin";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { peekLink } from "@/lib/email-login";
import { consumeBoardLink } from "@/lib/login-actions";
import { getCtx } from "@/lib/project";
import { getTranslations } from "next-intl/server";

/** The e-mailed link lands here; signing in needs one more click, so mail scanners cannot use the link up. */
export default async function LoginLink({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ t?: string }> }) {
  const { project: slug } = await params;
  const { t = "" } = await searchParams;
  const { project } = await getCtx(slug);
  const m = await getTranslations("boardAuth");
  if (!project.emailLogin) notFound();
  const email = t ? await peekLink(db, t, project.id) : null;
  if (!email) {
    return (
      <AuthShell title={m("linkGoneTitle")} lede={m("linkGoneLede")}>
        <Button asChild size="lg" className="w-full"><Link href={`/${slug}/login`}>{m("sendNewCode")}</Link></Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={m("loginTitle")} lede={m("loginLinkLede", { project: project.name })}>
      <form action={consumeBoardLink.bind(null, slug, t)} className="grid gap-4">
        <p className="text-[15px]">{m.rich("signInAs", { email, b: (c) => <b className="font-semibold break-all">{c}</b> })}</p>
        <Button type="submit" size="lg" className="w-full">{m("signIn")}</Button>
      </form>
    </AuthShell>
  );
}
