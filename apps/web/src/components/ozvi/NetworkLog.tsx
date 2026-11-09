"use client";

import { Check, ChevronDown, CircleAlert, Copy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { toCurl, type NetEntry } from "@/lib/bug-context";
import { fileSize } from "@/lib/format";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

const split = (u: string) => { try { const x = new URL(u); return { host: x.host, path: x.pathname + x.search + x.hash }; } catch { return { host: "", path: u }; } };

/** Team-only network log: failed requests marked (icon + colour), filter, "Copy as cURL", masked bodies on demand. */
export function NetworkLog({ entries, teamOnly }: { entries: NetEntry[]; teamOnly: React.ReactNode }) {
  const t = useTranslations("board.item.capture");
  const locale = useLocale() as Locale;
  const failedCount = entries.filter((e) => e.failed).length;
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const rows = entries.map((e, i) => ({ e, i })).filter(({ e }) => !onlyFailed || e.failed);

  const copy = (e: NetEntry, i: number) => navigator.clipboard?.writeText(toCurl(e)).then(() => {
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 2000);
  }, () => {});

  const seg = (on: boolean) => cn("h-8 rounded-md px-3 text-[12.5px] font-semibold transition-colors", on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground");

  return (
    <section aria-labelledby="net-h" className="min-w-0 rounded-xl border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h2 id="net-h" className="text-[14px] font-semibold">{t("network")}</h2>
          {teamOnly}
        </div>
        {failedCount > 0 && failedCount < entries.length && (
          <div role="group" aria-label={t("filter")} className="flex gap-0.5 rounded-lg border p-0.5">
            <button type="button" aria-pressed={!onlyFailed} className={seg(!onlyFailed)} onClick={() => setOnlyFailed(false)}>{t("all", { n: entries.length })}</button>
            <button type="button" aria-pressed={onlyFailed} className={seg(onlyFailed)} onClick={() => setOnlyFailed(true)}>{t("failed", { n: failedCount })}</button>
          </div>
        )}
      </header>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-muted-foreground">
            <th scope="col" className="w-px py-2 pr-3 pl-4 font-medium whitespace-nowrap">{t("col.status")}</th>
            <th scope="col" className="w-full max-w-0 py-2 pr-2 font-medium">{t("col.request")}</th>
            <th scope="col" className="hidden w-px py-2 pr-3 text-right font-medium whitespace-nowrap sm:table-cell">{t("col.time")}</th>
            <th scope="col" className="hidden w-px py-2 pr-3 text-right font-medium whitespace-nowrap sm:table-cell">{t("col.size")}</th>
            <th scope="col" className="w-px py-2 pr-2 sm:pr-3"><span className="sr-only">{t("col.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ e, i }) => {
            const { host, path } = split(e.url);
            const body = !!(e.req || e.res);
            const expanded = open === i;
            return (
              <Fragment key={i}>
                <tr className={cn("border-t align-top", e.failed && "bg-destructive/[0.06]")}>
                  <td className="py-2.5 pr-3 pl-4 whitespace-nowrap tabular-nums">
                    {e.failed
                      ? <span className="inline-flex items-center gap-1 font-semibold text-destructive"><CircleAlert className="size-3.5 shrink-0" aria-hidden />{e.status || "—"}</span>
                      : <span className="text-muted-foreground">{e.status}</span>}
                  </td>
                  <td className="w-full max-w-0 py-2.5 pr-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[11.5px] font-semibold">{e.method}</span>
                      <span className="truncate font-mono text-[12.5px]" title={e.url}>{path}</span>
                    </div>
                    <div className="truncate text-[11.5px] text-muted-foreground">
                      {host}{e.error ? ` · ${t("networkError")}` : ""}<span className="tabular-nums sm:hidden"> · {e.ms} ms</span>
                    </div>
                  </td>
                  <td className="hidden py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">{e.ms} ms</td>
                  <td className="hidden py-2.5 pr-3 text-right whitespace-nowrap text-muted-foreground tabular-nums sm:table-cell">{e.size != null ? fileSize(e.size, locale) : "—"}</td>
                  <td className="py-1.5 pr-2 sm:pr-3">
                    <div className="flex justify-end gap-0.5">
                      <button type="button" onClick={() => copy(e, i)} aria-label={t("copyCurl")} title={t("copyCurl")}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
                        {copied === i ? <Check className="size-4 text-st-done" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      </button>
                      {body && (
                        <button type="button" onClick={() => setOpen(expanded ? null : i)} aria-expanded={expanded}
                          aria-label={t(expanded ? "hideBody" : "showBody", { url: path })} title={t(expanded ? "hideBody" : "showBody", { url: path })}
                          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
                          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded && (
                  <tr className={cn(e.failed && "bg-destructive/[0.06]")}>
                    <td colSpan={5} className="px-4 pb-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        {e.req && <Body label={t("sent")} text={e.req} />}
                        {e.res && <Body label={t("response")} text={e.res} />}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="border-t px-4 py-2.5 text-[12px] text-muted-foreground">{t("masked")}</p>
      <span className="sr-only" role="status">{copied !== null ? t("copied") : ""}</span>
    </section>
  );
}

function Body({ label, text }: { label: string; text: string }) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* not JSON */ }
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[12px] font-semibold text-muted-foreground">{label}</p>
      <pre tabIndex={0} className="max-h-56 overflow-auto rounded-md bg-muted p-2.5 font-mono text-[11.5px] whitespace-pre-wrap break-all">{pretty}</pre>
    </div>
  );
}
