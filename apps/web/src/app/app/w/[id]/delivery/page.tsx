import { notFound, redirect } from "next/navigation";
import { ago, ConsoleHead } from "@/components/ozvi/console";
import { EmptyState, Segments } from "@/components/ozvi/page";
import { getAccount } from "@/lib/account";
import { consoleWorkspace, deliveriesOf } from "@/lib/console";
import { LOCALE_TAG } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { consoleTitle } from "@/lib/board-meta";

export const generateMetadata = consoleTitle("delivery");

export const dynamic = "force-dynamic";

type Tone = "ok" | "wait" | "bad" | "off";
type MailStatus = "sent" | "digested" | "queued" | "deferred" | "failed" | "skipped";
type HookStatus = "sent" | "queued" | "failed";
const MAIL_TONE: Record<MailStatus, Tone> = { sent: "ok", digested: "ok", queued: "wait", deferred: "wait", failed: "bad", skipped: "off" };
const HOOK_TONE: Record<HookStatus, Tone> = { sent: "ok", queued: "wait", failed: "bad" };
type Kind = "new_bug" | "new_idea" | "comment" | "comment_internal" | "comment_queued" | "idea_rejected" | "bug_status" | "idea_status" | "changelog" | "team_digest" | "digest" | "login" | "invite";
const KINDS = new Set<string>(["new_bug", "new_idea", "comment", "comment_internal", "comment_queued", "idea_rejected", "bug_status", "idea_status", "changelog", "team_digest", "digest", "login", "invite"]);

/** Status chip: shape + word, never colour alone. */
function Chip({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium whitespace-nowrap",
      tone === "ok" && "text-st-done", tone === "wait" && "text-muted-foreground", tone === "bad" && "text-destructive", tone === "off" && "text-muted-foreground")}>
      <span aria-hidden className={cn("size-2 shrink-0",
        tone === "ok" && "rounded-full bg-st-done", tone === "wait" && "rounded-full border-[1.5px] border-current",
        tone === "bad" && "rotate-45 bg-destructive", tone === "off" && "h-[2px] w-2.5 bg-current")} />
      {label}
    </span>
  );
}

export default async function Delivery({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; f?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = await consoleWorkspace(account.id, id);
  if (!ws) notFound();
  const tab = sp.t === "webhooks" ? "webhooks" : "emails";
  const problems = sp.f === "problems";
  const { mails, hooks } = await deliveriesOf(ws, { problems });
  const q = (t: string, f: boolean) => `?t=${t}${f ? "&f=problems" : ""}`;
  const multi = ws.projects.length > 1;
  const LIMIT = 100;
  const shown = tab === "emails" ? mails.length : hooks.length;
  const th = "px-4 py-2.5 font-medium";
  const locale = await requestLocale();
  const t = await getTranslations("console.delivery");
  const mail = (s: string) => Object.hasOwn(MAIL_TONE, s) ? { label: t(`mail.${s as MailStatus}`), tone: MAIL_TONE[s as MailStatus] } : { label: s, tone: "off" as const };
  const hook = (s: string) => Object.hasOwn(HOOK_TONE, s) ? { label: t(`hook.${s as HookStatus}`), tone: HOOK_TONE[s as HookStatus] } : { label: s, tone: "off" as const };
  const kind = (k: string) => KINDS.has(k) ? t(`kinds.${k as Kind}`) : k;
  const at = (d: Date) => ago(d, locale);
  const full = (d: Date) => d.toLocaleString(LOCALE_TAG[locale]);

  return (
    <>
      <ConsoleHead
        title={t("title")}
        lede={t("lede")}
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segments label={t("kind")} items={[
          { href: q("emails", problems), label: t("emails"), active: tab === "emails" },
          { href: q("webhooks", problems), label: t("webhooks"), active: tab === "webhooks" },
        ]} />
        <Segments label={t("filter")} items={[
          { href: q(tab, false), label: t("all"), active: !problems },
          { href: q(tab, true), label: t("problems"), active: problems },
        ]} />
      </div>

      {tab === "emails" ? (
        mails.length === 0 ? (
          <EmptyState title={problems ? t("noProblemsTitle") : t("noMailsTitle")} text={problems ? t("noProblems") : t("noMails")} />
        ) : (
          <>
          <ul className="divide-y rounded-xl border bg-surface sm:hidden">
            {mails.map((m) => (
              <li key={m.id} className="grid gap-1 px-4 py-3 text-[13.5px]">
                <div className="flex items-center justify-between gap-3"><Chip {...mail(m.status)} /><span className="text-[12.5px] text-muted-foreground">{at(m.at)}</span></div>
                <div className="font-medium break-words">{m.subject}</div>
                <div className="text-[12.5px] break-all text-muted-foreground">{m.to}{multi ? `, ${m.project}` : ""}</div>
                {m.error && m.status !== "sent" && <div className="mt-1 rounded-md bg-destructive/[0.06] px-2.5 py-1.5 font-mono text-[11.5px] break-words text-destructive">{m.error}</div>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-hidden rounded-xl border bg-surface sm:block">
            <table className="w-full table-fixed text-left text-[13.5px]">
              <colgroup><col className="w-[118px]" /><col className="w-[30%]" /><col />{multi && <col className="w-[140px]" />}<col className="w-[150px]" /></colgroup>
              <thead className="border-b bg-wash text-[12px] text-muted-foreground">
                <tr><th className={th}>{t("when")}</th><th className={th}>{t("to")}</th><th className={th}>{t("what")}</th>{multi && <th className={th}>{t("project")}</th>}<th className={th}>{t("status")}</th></tr>
              </thead>
              {mails.map((m) => (
                <tbody key={m.id} className="border-b last:border-b-0">
                  <tr className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground" title={full(m.at)}>{at(m.at)}</td>
                    <td className="truncate px-4 py-3" title={m.to}>{m.to}</td>
                    <td className="px-4 py-3">
                      <div className="truncate font-medium" title={m.subject}>{m.subject}</div>
                      <div className="text-[12.5px] text-muted-foreground">{kind(m.kind)}</div>
                    </td>
                    {multi && <td className="truncate px-4 py-3 text-muted-foreground">{m.project}</td>}
                    <td className="px-4 py-3"><Chip {...mail(m.status)} /></td>
                  </tr>
                  {m.error && m.status !== "sent" && (
                    <tr><td colSpan={multi ? 5 : 4} className="px-4 pb-3"><div className="rounded-md bg-destructive/[0.06] px-3 py-2 font-mono text-[12px] break-words text-destructive">{m.error}</div></td></tr>
                  )}
                </tbody>
              ))}
            </table>
          </div>
          </>
        )
      ) : hooks.length === 0 ? (
        <EmptyState title={problems ? t("noFailedHooksTitle") : t("noHooksTitle")} text={t("noHooks")} />
      ) : (
        <>
        <ul className="divide-y rounded-xl border bg-surface sm:hidden">
          {hooks.map((h) => (
            <li key={h.id} className="grid gap-1 px-4 py-3 text-[13.5px]">
              <div className="flex items-center justify-between gap-3"><Chip {...hook(h.status)} /><span className="text-[12.5px] text-muted-foreground">{at(h.at)}</span></div>
              <div className="font-mono text-[12.5px]">{h.event}</div>
              <div className="text-[12.5px] break-all text-muted-foreground">{h.host}{multi ? `, ${h.project}` : ""}{h.code ? `, HTTP ${h.code}` : ""}</div>
              {h.error && h.status !== "sent" && <div className="mt-1 rounded-md bg-destructive/[0.06] px-2.5 py-1.5 font-mono text-[11.5px] break-words text-destructive">{h.error}</div>}
            </li>
          ))}
        </ul>
        <div className="hidden overflow-hidden rounded-xl border bg-surface sm:block">
          <table className="w-full table-fixed text-left text-[13.5px]">
            <colgroup><col className="w-[118px]" /><col className="w-[30%]" /><col />{multi && <col className="w-[140px]" />}<col className="w-[170px]" /></colgroup>
            <thead className="border-b bg-wash text-[12px] text-muted-foreground">
              <tr><th className={th}>{t("when")}</th><th className={th}>{t("target")}</th><th className={th}>{t("event")}</th>{multi && <th className={th}>{t("project")}</th>}<th className={th}>{t("status")}</th></tr>
            </thead>
            {hooks.map((h) => (
              <tbody key={h.id} className="border-b last:border-b-0">
                <tr className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground" title={full(h.at)}>{at(h.at)}</td>
                  <td className="truncate px-4 py-3" title={h.host}>{h.host}</td>
                  <td className="px-4 py-3 font-mono text-[12.5px]">{h.event}</td>
                  {multi && <td className="truncate px-4 py-3 text-muted-foreground">{h.project}</td>}
                  <td className="px-4 py-3">
                    <Chip {...hook(h.status)} />
                    {(h.code || h.attempts > 1) && (
                      <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">
                        {[h.code ? `HTTP ${h.code}` : null, h.attempts > 1 ? t("attempt", { n: h.attempts }) : null].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </td>
                </tr>
                {h.error && h.status !== "sent" && (
                  <tr><td colSpan={multi ? 5 : 4} className="px-4 pb-3"><div className="rounded-md bg-destructive/[0.06] px-3 py-2 font-mono text-[12px] break-words text-destructive">{h.error}</div></td></tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
        </>
      )}
      {shown >= LIMIT && <p className="mt-4 text-[12.5px] text-muted-foreground">{t("limit", { n: LIMIT })}</p>}
    </>
  );
}
