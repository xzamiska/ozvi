import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, EmailLogin } from "@/components/EmailLogin";
import { getTranslations } from "next-intl/server";
import { getAccount } from "@/lib/account";
import { requestAccountLogin, verifyAccountLogin } from "@/lib/app-actions";

export default async function AppLogin({ searchParams }: { searchParams: Promise<{ expired?: string; denied?: string }> }) {
  if (await getAccount()) redirect("/app");
  const sp = await searchParams;
  const cloud = process.env.OZVI_MODE === "cloud";
  const t = await getTranslations("account.login");
  return (
    <AuthShell
      title={cloud ? t("cloudTitle") : t("selfTitle")}
      lede={cloud ? t("cloudLede") : t("selfLede")}
      foot={cloud && <>{t.rich("foot", { terms: (chunks) => <Link href="/terms" className="oz-link">{chunks}</Link>, privacy: (chunks) => <Link href="/privacy" className="oz-link">{chunks}</Link> })}</>}
    >
      {sp.denied && <p className="mb-4 rounded-lg border border-destructive/30 px-3.5 py-2.5 text-[14px] font-medium text-destructive" role="alert">{t("denied")}</p>}
      <EmailLogin request={requestAccountLogin} verify={verifyAccountLogin} expired={sp.expired === "1"} />
    </AuthShell>
  );
}
