import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConsoleHead } from "@/components/ozvi/console";
import { LOCALE_TAG } from "@/i18n/locales";
import { requestLocale } from "@/i18n/server";
import { getAccount } from "@/lib/account";
import { consoleTitle } from "@/lib/board-meta";
import { consoleWorkspace, mailOf } from "@/lib/console";

export const generateMetadata = consoleTitle("delivery");
export const dynamic = "force-dynamic";

/**
 * One e-mail as the recipient got it. The HTML is shown in a sandboxed frame (no scripts, no
 * same-origin access, links open outside); the plain-text part is below it.
 */
export default async function MailDetail({ params, searchParams }: { params: Promise<{ id: string; mail: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id, mail } = await params;
  const view = (await searchParams).v === "text" ? "text" : "html";
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = await consoleWorkspace(account.id, id);
  if (!ws) notFound();
  const m = await mailOf(ws, mail);
  if (!m) notFound();
  const locale = await requestLocale();
  const t = await getTranslations("console.delivery");
  const when = new Intl.DateTimeFormat(LOCALE_TAG[locale], { dateStyle: "medium", timeStyle: "short" }).format(m.sentAt ?? m.createdAt);
  const row = "grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t py-2 text-[13.5px] first:border-t-0";
  const tab = (v: "html" | "text", label: string) => (
    <Link href={`?v=${v}`} aria-current={view === v ? "page" : undefined}
      className={view === v ? "rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background" : "rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"}>{label}</Link>
  );
  return (
    <div>
      <Link href={`/app/w/${ws.id}/delivery`} className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t("backToList")}</Link>
      <ConsoleHead title={m.subject} lede={t("mailLede")} />
      <dl className="mb-6 rounded-xl border bg-surface px-4 py-1">
        <div className={row}><dt className="text-muted-foreground">{t("to")}</dt><dd className="break-all">{m.to}</dd></div>
        <div className={row}><dt className="text-muted-foreground">{t("when")}</dt><dd>{when}</dd></div>
        <div className={row}><dt className="text-muted-foreground">{t("project")}</dt><dd>{m.project}</dd></div>
        <div className={row}><dt className="text-muted-foreground">{t("status")}</dt><dd>{t.has(`mail.${m.status}` as never) ? t(`mail.${m.status}` as never) : m.status}{m.attempts > 1 ? ` · ${t("attempt", { n: m.attempts })}` : ""}</dd></div>
        {m.lastError && <div className={row}><dt className="text-muted-foreground">{t("error")}</dt><dd className="font-mono text-[12.5px] break-words text-destructive">{m.lastError}</dd></div>}
      </dl>
      <div className="mb-3 flex gap-1">{tab("html", t("asHtml"))}{tab("text", t("asText"))}</div>
      {view === "html" && m.html
        ? <iframe title={m.subject} srcDoc={m.html} sandbox="allow-popups allow-popups-to-escape-sandbox" className="h-[70vh] w-full rounded-xl border bg-white" />
        : <pre className="max-h-[70vh] overflow-auto rounded-xl border bg-surface p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">{m.text}</pre>}
    </div>
  );
}
