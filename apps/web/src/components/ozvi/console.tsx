import { ArrowUpRight } from "lucide-react";
import { DEFAULT_LOCALE, LOCALE_TAG, type Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { cn } from "@/lib/utils";

/** Small building blocks of the console (/app/w/…). Formatting follows the console locale. */

export const num = (x: number, locale: Locale = DEFAULT_LOCALE) => x.toLocaleString(LOCALE_TAG[locale]);
export const bytes = (b: number, locale: Locale = DEFAULT_LOCALE) => {
  const tag = LOCALE_TAG[locale];
  if (!Number.isFinite(b)) return translator(locale, "console")("units.unlimited");
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toLocaleString(tag, { maximumFractionDigits: b % 1024 ** 3 ? 1 : 0 })} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toLocaleString(tag, { maximumFractionDigits: 1 })} MB`;
  return `${Math.round(b / 1024).toLocaleString(tag)} kB`;
};

/** Money in integer cents, always EUR; whole euros without decimals. */
export const eur = (cents: number, locale: Locale = DEFAULT_LOCALE) =>
  new Intl.NumberFormat(LOCALE_TAG[locale], { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);

/** Short date ("8. 11. 2026", "08/11/2026"). */
export const day = (d: Date, locale: Locale = DEFAULT_LOCALE) => d.toLocaleDateString(LOCALE_TAG[locale], { day: "numeric", month: "numeric", year: "numeric" });

export function ago(d: Date, locale: Locale = DEFAULT_LOCALE) {
  const rel = new Intl.RelativeTimeFormat(LOCALE_TAG[locale], { numeric: "auto" });
  const s = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return translator(locale, "console")("units.justNow");
  if (abs < 3600) return rel.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rel.format(Math.round(s / 3600), "hour");
  if (abs < 30 * 86_400) return rel.format(Math.round(s / 86_400), "day");
  return day(d, locale);
}

/** Usage against a plan limit. Turns amber at 80 %, red at 100 % (and says so in words). */
export function Meter({ label, used, limit, format, className, full, locale = DEFAULT_LOCALE }: {
  label: string; used: number; limit: number; format?: (n: number, locale: Locale) => string; className?: string; locale?: Locale;
  /** For counted things (projects): reaching the limit is normal, say what it means instead of warning. */
  full?: string;
}) {
  const c = translator(locale, "console");
  const t = (k: "of" | "noLimit" | "near" | "over") => c(`units.${k}`);
  const fmt = (n: number) => (format ?? num)(n, locale);
  const finite = Number.isFinite(limit);
  const ratio = finite && limit > 0 ? Math.min(used / limit, 1) : 0;
  const state = !finite ? "ok" : full && used === limit ? "full" : used >= limit ? "over" : ratio >= 0.8 && !full ? "near" : "ok";
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          <b className={cn("font-semibold text-foreground", state === "over" && "text-destructive")}>{fmt(used)}</b>
          {finite ? <> {t("of")} {fmt(limit)}</> : ` · ${t("noLimit")}`}
        </span>
      </div>
      {finite && (
        <div className="h-1.5 overflow-hidden rounded-full bg-wash" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
          <div className={cn("h-full rounded-full bg-primary", state === "near" && "bg-warn", state === "over" && "bg-destructive")}
            style={{ width: `${Math.max(ratio * 100, used > 0 ? 2 : 0)}%` }} />
        </div>
      )}
      {state === "near" && <p className="text-[12.5px] text-muted-foreground">{t("near")}</p>}
      {state === "over" && <p className="text-[12.5px] text-destructive">{t("over")}</p>}
      {state === "full" && <p className="text-[12.5px] text-muted-foreground">{full}</p>}
    </div>
  );
}

/** A labelled number in a project row. Zero is quiet; links carry an arrow so they read as links. */
export function Stat({ label, value, tone = "plain", href, locale = DEFAULT_LOCALE }: { label: string; value: number; tone?: "plain" | "attention"; href?: string; locale?: Locale }) {
  const body = (
    <>
      <span className={cn("flex items-center gap-1.5 text-[24px] leading-none font-semibold tracking-[-0.03em] tabular-nums", value === 0 && "text-subtle", tone === "attention" && value > 0 && "text-brand-text")}>
        {num(value, locale)}
        {href && <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </span>
      <span className="text-[12.5px] leading-snug text-muted-foreground">{label}</span>
    </>
  );
  const cls = "grid content-start gap-1.5 px-4 py-3.5";
  return href
    ? <a href={href} className={cn(cls, "group transition-colors hover:bg-wash")}>{body}</a>
    : <div className={cls}>{body}</div>;
}

export function Card({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-4 rounded-xl border bg-surface p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[14px] font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Console page header: title row with actions aligned to the title, optional lede below. */
export function ConsoleHead({ title, lede, actions }: { title: React.ReactNode; lede?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.035em] md:text-[30px]">{title}</h1>
        {lede && <p className="mt-1.5 max-w-[64ch] text-[14.5px] text-muted-foreground">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:pt-1">{actions}</div>}
    </div>
  );
}

/** Section heading inside a console page. */
export function SectionHead({ title, action, id }: { title: string; action?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 id={id} className="text-[15px] font-semibold tracking-tight">{title}</h2>
      {action}
    </div>
  );
}

/** One activity entry: what happened first, who and where second (no "pozval(a)" form letters). */
export function ActivityLine({ label, detail, actor, project, when }: { label: string; detail: string | null; actor: string | null; project: string | null; when?: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <p className="text-[13.5px] leading-snug break-words"><span className="font-medium">{label}</span>{detail ? <> <span className="text-muted-foreground">{detail}</span></> : null}</p>
      <p className="flex flex-wrap gap-x-2 text-[12px] text-muted-foreground">
        <span>{actor ?? "Ozvi"}</span>{project && <span>{project}</span>}{when && <span>{when}</span>}
      </p>
    </div>
  );
}
