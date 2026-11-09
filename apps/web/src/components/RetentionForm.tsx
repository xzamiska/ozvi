"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import { previewRetentionAction, saveRetention, type RetentionState } from "@/lib/retention-actions";
import type { RetentionReport } from "@/lib/retention";
import { hint, panel, Result } from "./settings";

const CAPTURE_DAYS = [30, 90, 180, 365];
const CLOSED_FILES_DAYS = [30, 90, 180, 365];
const CONTACT_MONTHS = [6, 12, 24];

type Key = "capture" | "closedFiles" | "contacts";

/**
 * Admin → Dáta: how long the project keeps bug recordings, closed bugs' files and placeholder contacts.
 * Every change shows a dry run of what the next nightly run would remove with those values.
 */
export function RetentionForm({ slug, initial, preview: initialPreview, lastRun }: {
  slug: string;
  initial: Record<Key, number | null>;
  preview: RetentionReport;
  /** Already formatted ("pred 3 hodinami") or null when it never ran. */
  lastRun: string | null;
}) {
  const t = useTranslations("admin.retention");
  const s = useTranslations("admin.settings");
  const locale = useLocale() as Locale;
  const [state, action, pending] = useActionState((p: RetentionState, f: FormData) => saveRetention(slug, p, f), {});
  const [values, setValues] = useState<Record<Key, string>>({
    capture: initial.capture === null ? "never" : String(initial.capture),
    closedFiles: initial.closedFiles === null ? "never" : String(initial.closedFiles),
    contacts: initial.contacts === null ? "never" : String(initial.contacts),
  });
  const [preview, setPreview] = useState<RetentionReport | null>(initialPreview);
  const [previewError, setPreviewError] = useState<string>();
  const [loading, startPreview] = useTransition();
  const seq = useRef(0);

  const change = (k: Key, v: string) => {
    const next = { ...values, [k]: v };
    setValues(next);
    const f = new FormData();
    for (const [key, val] of Object.entries(next)) f.set(key, val);
    const mine = ++seq.current;
    startPreview(async () => {
      const r = await previewRetentionAction(slug, f);
      if (mine !== seq.current) return;
      setPreview(r.report ?? null);
      setPreviewError(r.error);
    });
  };

  const rows: { key: Key; options: number[]; unit: "days" | "months" }[] = [
    { key: "capture", options: CAPTURE_DAYS, unit: "days" },
    { key: "closedFiles", options: CLOSED_FILES_DAYS, unit: "days" },
    { key: "contacts", options: CONTACT_MONTHS, unit: "months" },
  ];
  const mb = (b: number) => (b / 1024 / 1024).toLocaleString(LOCALE_TAG[locale], { maximumFractionDigits: 1 });
  const lines = preview ? [
    preview.captures > 0 && t("preview.captures", { n: preview.captures }),
    preview.screenshots > 0 && t("preview.screenshots", { n: preview.screenshots }),
    preview.files > 0 && t("preview.files", { n: preview.files }),
    preview.contacts > 0 && t("preview.contacts", { n: preview.contacts }),
  ].filter((x): x is string => !!x) : [];

  return (
    <form action={action} className={panel}>
      <div className="grid divide-y">
        {rows.map(({ key, options, unit }) => (
          <div key={key} className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-start sm:gap-6">
            <div className="grid gap-0.5">
              <Label htmlFor={`retention-${key}`} className="text-[14px] font-semibold">{t(`${key}.label`)}</Label>
              <p className={hint} id={`retention-${key}-hint`}>{t(`${key}.hint`)}</p>
            </div>
            <Select name={key} value={values[key]} onValueChange={(v) => change(key, v)}>
              <SelectTrigger id={`retention-${key}`} aria-describedby={`retention-${key}-hint`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((n) => <SelectItem key={n} value={String(n)}>{t(unit, { n })}</SelectItem>)}
                <SelectItem value="never">{t("never")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="grid gap-2 rounded-lg border bg-wash px-4 py-3.5" aria-live="polite" aria-busy={loading || undefined}>
        <p className="text-[13.5px] font-semibold">{t("preview.title")}</p>
        {previewError ? <p className="text-[13.5px] text-destructive">{previewError}</p>
          : lines.length === 0 ? <p className="text-[13.5px] text-muted-foreground">{t("preview.none")}</p>
          : (
            <ul className={`grid gap-1 text-[13.5px] transition-opacity ${loading ? "opacity-60" : ""}`}>
              {lines.map((l) => <li key={l} className="flex gap-2"><span aria-hidden className="mt-[0.55em] size-1 shrink-0 rounded-full bg-line-strong" />{l}</li>)}
              {preview && preview.bytes > 0 && <li className="mt-1 text-muted-foreground">{t("preview.bytes", { mb: mb(preview.bytes) })}</li>}
            </ul>
          )}
        <p className={hint}>{lastRun ? t("lastRun", { when: lastRun }) : t("neverRun")} {t("schedule")}</p>
      </div>

      <div className="grid gap-3">
        <Result error={state.error} ok={state.ok} />
        <div><Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? s("saving") : t("save")}</Button></div>
      </div>
    </form>
  );
}
