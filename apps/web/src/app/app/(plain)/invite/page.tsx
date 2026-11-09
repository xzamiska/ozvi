import Link from "next/link";
import { AuthShell } from "@/components/EmailLogin";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { getAccount } from "@/lib/account";
import { acceptInviteAction } from "@/lib/account-actions";
import { peekInvite } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Confirm page for an e-mailed invitation (POST to accept, so mail scanners cannot use it up). */
export default async function Invite({ searchParams }: { searchParams: Promise<{ t?: string; expired?: string }> }) {
  const { t = "" } = await searchParams;
  const m = await getTranslations("account.invite");
  const inv = t ? await peekInvite(t) : null;
  if (!inv) {
    return (
      <AuthShell title={m("expiredTitle")} lede={m("expiredLede")}>
        <Button asChild size="lg" variant="outline" className="w-full"><Link href="/app">{m("myProjects")}</Link></Button>
      </AuthShell>
    );
  }
  const account = await getAccount();
  const other = account && account.email !== inv.email;
  return (
    <AuthShell title={m("title", { ws: inv.workspace })}>
      <form action={acceptInviteAction.bind(null, t)} className="grid gap-4">
        <p className="text-[15px] leading-relaxed">
          {inv.inviter ? <><b className="font-semibold">{inv.inviter}</b>{m("invitesYou")}</> : m("weInvite")}{m("as")}<b className="font-semibold">{inv.role === "owner" || inv.role === "member" ? m(`roleAs.${inv.role}`) : inv.role}</b>.{" "}
          {m("signInAs")}<b className="font-semibold break-all">{inv.email}</b>{account ? "" : m("created")}.
        </p>
        {other && <p className="rounded-lg bg-muted px-3.5 py-2.5 text-[13.5px] text-muted-foreground" role="note">{m.rich("other", { current: account.email, email: inv.email, addr: (chunks) => <span className="break-all">{chunks}</span> })}</p>}
        <Button type="submit" size="lg" className="w-full">{m("accept")}</Button>
      </form>
    </AuthShell>
  );
}
