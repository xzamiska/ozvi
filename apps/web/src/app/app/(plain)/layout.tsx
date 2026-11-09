import Link from "next/link";
import { AppAccountMenu } from "@/components/AccountForms";
import { OzviLogo } from "@/components/ozvi/Logo";
import { getTranslations } from "next-intl/server";
import { getAccount } from "@/lib/account";

/** Focused pages outside a workspace (login, new project, account, invite): a slim bar, no sidebar. */
export default async function PlainLayout({ children }: { children: React.ReactNode }) {
  const account = await getAccount();
  const cloud = process.env.OZVI_MODE === "cloud";
  const t = await getTranslations("account.layout");
  const tA11y = await getTranslations("a11y");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-surface">
        <div className="oz-frame flex h-14 items-center justify-between gap-4">
          <Link href={account || !cloud ? "/app" : "/"} aria-label={account ? t("backToConsole") : t("home")}>
            <OzviLogo markClassName="size-6" className="[&>span:last-child]:text-[18px]" />
          </Link>
          {account ? <AppAccountMenu name={account.name} email={account.email} />
            : cloud ? <Link href="/" className="text-[13.5px] font-medium text-muted-foreground hover:text-foreground">{t("backHome")}</Link> : null}
        </div>
      </header>
      <div className="flex-1">{children}</div>
      {cloud && (
        <footer>
          <nav aria-label={t("legal")} className="oz-frame flex flex-wrap gap-x-5 gap-y-1 py-6 text-[12.5px] text-muted-foreground md:px-8">
            <Link href="/terms" className="hover:text-foreground">{t("terms")}</Link>
            <Link href="/privacy" className="hover:text-foreground">{t("privacy")}</Link>
            <Link href="/accessibility" className="hover:text-foreground">{tA11y("link")}</Link>
          </nav>
        </footer>
      )}
    </div>
  );
}
