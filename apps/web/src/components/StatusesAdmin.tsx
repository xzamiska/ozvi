"use client";

import { CornerDownRight, Plus, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusMark } from "@/components/ozvi/route";
import { saveStatusesAction, saveUnansweredDays, type TagState } from "@/lib/tag-actions";
import type { Locale } from "@/i18n/locales";
import type { Kind } from "@/lib/route";
import { LABEL_MAX, stagesOf, SUBS_PER_STAGE, type Labels, type StatusLabels, type SubStatus } from "@/lib/statuses";
import { cn } from "@/lib/utils";
import { hint, noFill, Result } from "./settings";

type Draft = { key: string; id?: string; kind: Kind; stage: string; labels: Labels };

/**
 * Admin: rename route stops per board language and add sub-statuses under a stop. The stop stays the
 * source of truth (route, e-mails, roadmap, GitHub); a sub-status is a finer name for where it is.
 */
export function StatusesAdmin({ slug, locales, labels, subs, defaults }: {
  slug: string; locales: Locale[]; labels: StatusLabels; subs: SubStatus[];
  /** Built-in stop names per locale (placeholders). */
  defaults: Record<Locale, Record<string, string>>;
}) {
  const t = useTranslations("admin.statuses");
  const s = useTranslations("admin.settings");
  const [kind, setKind] = useState<Kind>("idea");
  const [names, setNames] = useState<StatusLabels>(labels);
  const [drafts, setDrafts] = useState<Draft[]>(subs.map((x) => ({ key: x.id, id: x.id, kind: x.kind, stage: x.stage, labels: x.labels })));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();

  const setName = (status: string, l: Locale, v: string) => setNames((n) => ({ ...n, [status]: { ...n[status], [l]: v } }));
  const setSub = (key: string, l: Locale, v: string) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, labels: { ...x.labels, [l]: v } } : x)));
  const add = (stage: string) => setDrafts((d) => [...d, { key: `new-${Date.now()}-${Math.random()}`, kind, stage, labels: {} }]);
  const remove = (key: string) => setDrafts((d) => d.filter((x) => x.key !== key));

  const save = () => start(async () => {
    setError(undefined);
    const r = await saveStatusesAction(slug, JSON.stringify({ labels: names, subs: drafts.map(({ id, kind, stage, labels }) => ({ id, kind, stage, labels })) }));
    if (r.error) setError(r.error); else toast(r.ok);
  });

  const inputs = (value: Labels | undefined, onChange: (l: Locale, v: string) => void, placeholder: (l: Locale) => string, label: string) => (
    <div className={cn("grid min-w-0 gap-2", locales.length > 1 && "sm:grid-cols-2", locales.length > 2 && "xl:grid-cols-3")}>
      {locales.map((l) => (
        <div key={l} className="relative min-w-0">
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-[11px] font-semibold text-muted-foreground uppercase">{l}</span>
          <Input value={value?.[l] ?? ""} onChange={(e) => onChange(l, e.target.value)} maxLength={LABEL_MAX} placeholder={placeholder(l)}
            aria-label={`${label} (${l.toUpperCase()})`} className="h-8 bg-surface pl-9 text-[13.5px]" {...noFill} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label={t("kind")} className="inline-flex h-9 w-fit items-center rounded-lg border bg-surface p-0.5">
        {(["idea", "bug"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
            className={cn("inline-flex h-full items-center rounded-md px-3 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground",
              kind === k && "bg-foreground text-surface hover:text-surface")}>
            {t(k === "idea" ? "ideas" : "bugs")}
          </button>
        ))}
      </div>

      <ol className="divide-y overflow-hidden rounded-xl border bg-surface">
        {stagesOf(kind).map((stage) => {
          const own = drafts.filter((d) => d.kind === kind && d.stage === stage);
          return (
            <li key={stage} className="grid gap-3 px-4 py-4 sm:px-5">
              <div className="grid gap-2 md:grid-cols-[200px_minmax(0,1fr)] md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusMark kind={kind} status={stage} />
                  <span className="text-[14px] font-semibold">{defaults[locales[0]!]?.[stage] ?? stage}</span>
                  {stage === "in_progress" && <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground" title={t("sharedHint")}>{t("shared")}</span>}
                </div>
                {inputs(names[stage], (l, v) => setName(stage, l, v), (l) => defaults[l]?.[stage] ?? "", t("rename"))}
              </div>
              {own.length > 0 && (
                <ul className="grid gap-2 md:pl-[216px]">
                  {own.map((d) => (
                    <li key={d.key} className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2">
                      <CornerDownRight className="size-4 text-muted-foreground" aria-hidden />
                      {inputs(d.labels, (l, v) => setSub(d.key, l, v), (l) => (l === locales[0] ? t("subPlaceholder") : d.labels[locales[0]!] ?? ""), t("subName"))}
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removeSub")} title={t("removeSub")} onClick={() => remove(d.key)}><X /></Button>
                    </li>
                  ))}
                </ul>
              )}
              {own.length < SUBS_PER_STAGE && (
                <div className="md:pl-[216px]">
                  <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => add(stage)}><Plus />{t("addSub")}</Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className={hint}>{t("note")}</p>
      <Result error={error} />
      <div><Button type="button" onClick={save} disabled={pending} aria-busy={pending || undefined}>{pending ? s("saving") : t("save")}</Button></div>
    </div>
  );
}

/** Admin: after how many days a waiting report lands in the team's "Bez odpovede" queue. */
export function UnansweredForm({ slug, days }: { slug: string; days: number }) {
  const t = useTranslations("admin.statuses");
  const s = useTranslations("admin.settings");
  const [state, action, pending] = useActionState((p: TagState, f: FormData) => saveUnansweredDays(slug, p, f), {});
  return (
    <form action={action} className="grid gap-4 rounded-xl border bg-surface p-5 sm:p-6">
      <div className="grid gap-1.5">
        <label htmlFor="unanswered-days" className="text-[14px] font-semibold">{t("days")}</label>
        <div className="flex items-center gap-2">
          <Input id="unanswered-days" name="days" type="number" inputMode="numeric" min={1} max={90} required defaultValue={days}
            className="w-24 tabular-nums" aria-describedby="unanswered-days-hint" {...noFill} />
          <span className="text-[14px] text-muted-foreground">{t("daysUnit")}</span>
        </div>
        <p className={hint} id="unanswered-days-hint">{t("daysHint")}</p>
      </div>
      <Result error={state.error} ok={state.ok} />
      <div><Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? s("saving") : t("daysSave")}</Button></div>
    </form>
  );
}
