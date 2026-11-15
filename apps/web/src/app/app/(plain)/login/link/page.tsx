import Link from "next/link";
import { AuthShell } from "@/components/EmailLogin";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { consumeAccountLink } from "@/lib/app-actions";
import { db } from "@/lib/db";
import { peekLink } from "@/lib/email-login";
import { safeAppNext } from "@/lib/account-rules";

export default async function AppLoginLink({ searchParams }: { searchParams: Promise<{ t?: string; next?: string }> }) {
  const { t = "", next: rawNext } = await searchParams;
  const next = safeAppNext(rawNext);
  const m = await getTranslations("account.login");
  const email = t ? await peekLink(db, t, null) : null;
  if (!email) {
    return (
      <AuthShell title={m("linkExpiredTitle")} lede={m("linkExpired")}>
        <Button asChild size="lg" className="w-full"><Link href={next ? `/app/login?next=${encodeURIComponent(next)}` : "/app/login"}>{m("sendNew")}</Link></Button>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={m("cloudTitle")}>
      <form action={consumeAccountLink.bind(null, t, next)} className="grid gap-4">
        <p className="text-[15px]">{m("signInAs")}<b className="font-semibold break-all">{email}</b>.</p>
        <Button type="submit" size="lg" className="w-full">{m("signIn")}</Button>
      </form>
    </AuthShell>
  );
}
