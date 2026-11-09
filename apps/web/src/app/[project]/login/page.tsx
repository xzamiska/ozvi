import { notFound } from "next/navigation";
import { AuthShell, EmailLogin } from "@/components/EmailLogin";
import { requestBoardLogin, verifyBoardLogin } from "@/lib/login-actions";
import { publicUrl } from "@/lib/email/url";
import { getCtx } from "@/lib/project";
import { safeReturn } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import { boardTitle } from "@/lib/board-meta";

export const generateMetadata = boardTitle("boardAuth", "loginTitle");

export default async function Login({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ return?: string; expired?: string }> }) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project } = await getCtx(slug);
  const m = await getTranslations("boardAuth");
  if (!project.emailLogin) notFound();
  const ret = safeReturn(slug, sp.return);
  return (
    <AuthShell title={m("loginTitle")} lede={m("loginLede", { project: project.name })}
      foot={m.rich("teamFoot", { link: (c) => <a className="oz-link" href={`${publicUrl()}/app/open/${slug}`}>{c}</a> })}>
      <EmailLogin request={requestBoardLogin.bind(null, slug, ret)} verify={verifyBoardLogin.bind(null, slug, ret)} expired={sp.expired === "1"} />
    </AuthShell>
  );
}
