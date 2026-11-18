import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, EmailLogin } from "@/components/EmailLogin";
import { LanguageLine } from "@/components/ozvi/LanguageMenu";
import { getTranslations } from "next-intl/server";
import { getAccount } from "@/lib/account";
import { safeAppNext, signupClosed } from "@/lib/account-rules";
import { LEGAL } from "@/lib/legal";
import { requestAccountLogin, verifyAccountLogin } from "@/lib/app-actions";

export default async function AppLogin({ searchParams }: { searchParams: Promise<{ expired?: string; denied?: string; next?: string }> }) {
  const sp = await searchParams;
  // A link that needs a signed-in console (e.g. the e-mail change) sends here with ?next= and gets it back.
  const next = safeAppNext(sp.next);
  if (await getAccount()) redirect(next ?? "/app");
  const cloud = process.env.OZVI_MODE === "cloud";
  const t = await getTranslations("account.login");
  return (
    <AuthShell
      title={cloud ? t("cloudTitle") : t("selfTitle")}
      lede={cloud ? t("cloudLede") : t("selfLede")}
      foot={cloud && <>{t.rich("foot", { terms: (chunks) => <Link href="/terms" className="oz-link">{chunks}</Link>, privacy: (chunks) => <Link href="/privacy" className="oz-link">{chunks}</Link> })}</>}
    >
      {cloud && signupClosed() && (
        <p className="mb-4 rounded-lg border border-border px-3.5 py-2.5 text-[14px]">
          {t.rich("closed", { mail: (chunks) => <a href={`mailto:${LEGAL.email}`} className="oz-link">{chunks}</a>, email: LEGAL.email })}
        </p>
      )}
      {sp.denied && <p className="mb-4 rounded-lg border border-destructive/30 px-3.5 py-2.5 text-[14px] font-medium text-destructive" role="alert">{t("denied")}</p>}
      <EmailLogin request={requestAccountLogin.bind(null, next)} verify={verifyAccountLogin.bind(null, next)} expired={sp.expired === "1"} />
      <LanguageLine label={(await getTranslations("console.nav"))("language")} />
    </AuthShell>
  );
}
