import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/EmailLogin";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { getAccount } from "@/lib/account";
import { confirmEmailChangeAction } from "@/lib/account-actions";
import { db } from "@/lib/db";
import { peekEmailChange } from "@/lib/email-login";

export const dynamic = "force-dynamic";

/** Confirm page for the link sent to a new account address (POST, so mail scanners cannot use it up). */
export default async function ConfirmEmail({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const m = await getTranslations("account.confirmEmail");
  const change = t ? await peekEmailChange(db, t) : null;
  if (!change) {
    return (
      <AuthShell title={m("expiredTitle")} lede={m("expired")}>
        <Button asChild size="lg" className="w-full"><Link href="/app/account">{m("openAccount")}</Link></Button>
      </AuthShell>
    );
  }
  const account = await getAccount();
  if (!account) redirect(`/app/login`);
  return (
    <AuthShell title={m("title")}>
      <form action={confirmEmailChangeAction.bind(null, t)} className="grid gap-4">
        <dl className="grid gap-x-4 gap-y-1.5 text-[14px] sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{m("now")}</dt><dd className="font-medium break-all">{account.email}</dd>
          <dt className="text-muted-foreground">{m("next")}</dt><dd className="font-semibold break-all">{change.email}</dd>
        </dl>
        <p className="text-[14px] text-muted-foreground">{m("note")}</p>
        <Button type="submit" size="lg" className="w-full">{m("change")}</Button>
      </form>
    </AuthShell>
  );
}
