import { ArrowUpCircle, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { ago } from "@/lib/format";
import { updaterConfigured, updaterStatus, type UpdaterStatus } from "@/lib/updater";
import { checkForUpdate, updateCheckEnabled } from "@/lib/version";
import { cn } from "@/lib/utils";
import { CheckNowButton, RefreshWhileRunning, UpdateNowButton, UpdaterModeForm } from "./UpdaterControls";

const COMMAND = "docker compose pull && docker compose up -d";

/**
 * Self-host admin: running version and how to update. With the ozvi-updater sidecar (OZVI_UPDATER_URL)
 * the admin picks a mode and updates with a button; without it, the release check shows the command.
 */
export async function UpdateNotice({ className, locale = "sk", slug }: { className?: string; locale?: Locale; slug: string }) {
  if (process.env.OZVI_MODE === "cloud") return null;
  if (updaterConfigured()) return <UpdaterPanel className={className} locale={locale} slug={slug} status={await updaterStatus()} />;

  const t = await getTranslations({ locale, namespace: "forms.update" });
  const info = await checkForUpdate();
  const enabled = updateCheckEnabled();

  return (
    <section aria-labelledby="update-h" className={cn("rounded-xl border bg-surface p-5", info.newer && "border-brand-line bg-brand-soft/50", className)}>
      <div className="flex flex-wrap items-start gap-3">
        {info.newer ? <ArrowUpCircle className="mt-0.5 size-5 text-brand-text" /> : <CheckCircle2 className="mt-0.5 size-5 text-st-done" />}
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 id="update-h" className="font-heading text-[15px] font-bold">
            {info.newer ? t("available", { v: info.latest!.version }) : `Ozvi ${info.current}`}
          </h2>
          <p className="text-[13.5px] text-muted-foreground">
            {info.newer
              ? <>{t("running")} <span data-num>{info.current}</span>.{info.latest!.breaking ? t("breaking") : ""}</>
              : !enabled ? (info.current === "dev" ? t("devOff") : t("off"))
              : info.latest ? t("latest") : t("failed")}
          </p>
          {info.newer && (
            <div className="mt-2 grid gap-2">
              <p className="text-[13px] text-muted-foreground">{t("how")}</p>
              <Command />
              <a href={info.latest!.url} target="_blank" rel="noreferrer" className="oz-link text-[13.5px]">{t("whatsNew", { v: info.latest!.version })}</a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const Command = () => (
  <code className="block rounded-md bg-muted px-3 py-2 font-mono text-[12.5px] break-all select-all">{COMMAND}</code>
);

async function UpdaterPanel({ className, locale, slug, status: s }: { className?: string; locale: Locale; slug: string; status: UpdaterStatus | null }) {
  const t = await getTranslations({ locale, namespace: "forms.updater" });
  if (!s) {
    return (
      <section aria-labelledby="update-h" className={cn("rounded-xl border border-destructive/40 bg-surface p-5", className)}>
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 text-destructive" />
          <div className="grid gap-1">
            <h2 id="update-h" className="font-heading text-[15px] font-bold">{t("title")}</h2>
            <p className="text-[13.5px] text-muted-foreground">{t("unreachable")}</p>
          </div>
        </div>
      </section>
    );
  }

  const d = s.decision;
  const target = d?.update ? d.target : d?.newer ?? null;
  const reason = d && !d.update && d.newer && d.reason !== "notAuto" ? d.reason : null;
  const fmtAgo = (iso: string) => ago(new Date(iso), locale);

  return (
    <section aria-labelledby="update-h" className={cn("grid gap-5 rounded-xl border bg-surface p-5", target && "border-brand-line", className)}>
      <RefreshWhileRunning running={s.running} />
      <div className="flex flex-wrap items-start gap-3">
        {s.running ? <Loader2 className="mt-0.5 size-5 animate-spin text-brand-text motion-reduce:animate-none" />
          : target ? <ArrowUpCircle className="mt-0.5 size-5 text-brand-text" />
          : <CheckCircle2 className="mt-0.5 size-5 text-st-done" />}
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 id="update-h" className="font-heading text-[15px] font-bold">
            {target ? t("available", { v: target.version }) : t("version", { v: s.current ?? "?" })}
          </h2>
          <p className="text-[13.5px] text-muted-foreground" role={s.running ? "status" : undefined}>
            {s.running ? t("running") : target ? t("version", { v: s.current ?? "?" }) : t("upToDate")}
          </p>
          {s.ref && <p className="font-mono text-[12px] break-all text-muted-foreground">{t("image", { ref: s.ref })}</p>}
        </div>
      </div>

      {target && !s.running && (
        <div className="grid gap-3">
          {d?.update && s.mode !== "notify" && <UpdateNowButton slug={slug} version={target.version} />}
          {d && !d.update && d.reason === "notifyOnly" && (
            <div className="grid gap-2"><p className="text-[13px] text-muted-foreground">{t("reasons.notifyOnly")}</p><Command /></div>
          )}
          {reason && reason !== "notifyOnly" && (reason === "pinned" || reason === "outsideLine" || reason === "breaking") && (
            <p className="text-[13.5px] text-muted-foreground">{t(`reasons.${reason}`, { v: target.version })}</p>
          )}
          {target.url && <a href={target.url} target="_blank" rel="noreferrer" className="oz-link justify-self-start text-[13.5px]">{t("whatsNew", { v: target.version })}</a>}
        </div>
      )}

      <UpdaterModeForm slug={slug} mode={s.mode} window={s.window} tz={s.timeZone} />
      <p className="text-[13px] text-muted-foreground">{t("backups")}</p>

      {s.history.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-[14px] font-semibold">{t("history")}</h3>
          <ul className="grid gap-1.5 text-[13.5px]">
            {s.history.slice(0, 5).map((h) => (
              <li key={h.at} className="flex flex-wrap gap-x-2">
                <span className={cn("font-medium", h.result === "updated" ? "text-st-done" : h.result === "noChange" ? "" : "text-destructive")}>
                  {t(`results.${h.result}`, { from: h.from, to: h.to ?? "?" })}
                </span>
                <span className="text-muted-foreground">{fmtAgo(h.at)} · {t(`triggers.${h.trigger}`)}</span>
                {h.message && h.result !== "updated" && <span className="w-full text-[12.5px] break-words text-muted-foreground">{h.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-[13px] text-muted-foreground">
        {s.feedAt && <span>{t("lastCheck", { when: fmtAgo(s.feedAt) })}</span>}
        <CheckNowButton slug={slug} />
      </div>
    </section>
  );
}
