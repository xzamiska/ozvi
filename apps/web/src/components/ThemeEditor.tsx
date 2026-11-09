"use client";

import { checkContrast, FONT_CATALOGUE, fontsHref, presets, renderedPalettes, themeSchema, toCss, type Theme } from "@ozvi/theme";
import { ChevronUp, MessageSquare, Plus, TriangleAlert } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { RouteRail, StatusTag } from "@/components/ozvi/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveTheme, type AdminState } from "@/lib/admin-actions";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Field, hint, noFill, panel, Result } from "./settings";

const COLORS: (keyof Theme["colors"])[] = ["accent", "ink", "surface", "canvas", "border"];

const SCOPE = ".oz-theme-preview";
/** Derived tokens are resolved on :root, so the preview re-derives them from its own palette. */
const DERIVED = `${SCOPE}{
  --oz-muted:color-mix(in oklab,var(--oz-ink) 62%,var(--oz-surface));
  --oz-subtle:color-mix(in oklab,var(--oz-ink) 45%,var(--oz-surface));
  --oz-faint:color-mix(in oklab,var(--oz-ink) 5%,var(--oz-surface));
  --oz-wash:color-mix(in oklab,var(--oz-ink) 3%,var(--oz-canvas));
  --oz-line:var(--oz-border);
  --oz-line-strong:color-mix(in oklab,var(--oz-ink) 20%,var(--oz-border));
  --oz-field-line:color-mix(in oklab,var(--oz-ink) 42%,var(--oz-border));
  --oz-accent-soft:color-mix(in oklab,var(--oz-accent) 11%,var(--oz-surface));
  --oz-accent-line:color-mix(in oklab,var(--oz-accent) 35%,var(--oz-border));
  --oz-accent-text:color-mix(in oklab,var(--oz-accent) 82%,var(--oz-ink));
  --oz-st-wait:var(--oz-subtle);--oz-st-work:var(--oz-accent);--oz-st-off:var(--oz-subtle);
}`;

/** Copy (title, body) comes from the dictionary by position. */
const SAMPLE = [
  { n: 128, votes: 42, status: "planned", comments: 6 },
  { n: 131, votes: 17, status: "in_progress", comments: 2 },
];

export function ThemeEditor({ slug, initial }: { slug: string; initial: Theme }) {
  const locale = useLocale();
  const t = useTranslations("admin.theme");
  const s = useTranslations("admin.settings");
  const warn = t.raw("warn") as Record<string, string>;
  const sample = t.raw("sample") as { title: string; body: string; when: string }[];
  const tagLabel = (k: keyof Theme["colors"]) => t(`colors.${k}`);
  const [theme, setTheme] = useState<Theme>(initial);
  const [state, action, pending] = useActionState((p: AdminState, f: FormData) => saveTheme(slug, p, f), {});
  const parsed = useMemo(() => themeSchema.safeParse(theme), [theme]);
  const warnings = parsed.success ? checkContrast(parsed.data) : [];
  // What the board will actually render: colours nudged so text always reaches WCAG AA.
  const rendered = parsed.success ? renderedPalettes(parsed.data) : null;
  const adjusted = rendered ? (rendered.adjusted.light as (keyof Theme["colors"])[]) : [];
  const css = parsed.success ? toCss(parsed.data, SCOPE) + DERIVED : "";
  const fonts = parsed.success ? fontsHref(parsed.data, { skipBundled: true }) : null;
  const set = (patch: Partial<Theme>) => setTheme((th) => ({ ...th, ...patch }));
  const setColor = (k: keyof Theme["colors"], v: string) => setTheme((th) => ({ ...th, colors: { ...th.colors, [k]: v } }));
  const issue = !parsed.success ? parsed.error.issues[0] : undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)] xl:items-start">
      <form action={action} className={panel}>
        <input type="hidden" name="theme" value={JSON.stringify(theme)} />

        <div className="grid gap-2">
          <span className="text-[14px] font-semibold" id="t-presets">{t("presets")}</span>
          <div role="group" aria-labelledby="t-presets" className="flex flex-wrap gap-2">
            {Object.entries(presets).map(([k, p]) => (
              <Button key={k} type="button" variant="outline" size="sm"
                onClick={() => setTheme(themeSchema.parse({ ...p, logoUrl: theme.logoUrl }))}>
                <span aria-hidden className="size-3 rounded-full border" style={{ background: p.colors.accent }} />
                {p.name}
              </Button>
            ))}
          </div>
          <p className={hint}>{t("presetsHint")}</p>
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[14px] font-semibold">{t("colorsLegend")}</legend>
          {COLORS.map((k) => { const label = tagLabel(k); return (
            <div key={k} className="grid gap-1.5">
              <Label htmlFor={`t-${k}`} className="text-[13.5px]">{label}</Label>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={t("pickColor", { label })} value={/^#[0-9a-f]{6}$/i.test(theme.colors[k]) ? theme.colors[k] : "#000000"}
                  onChange={(e) => setColor(k, e.target.value.toUpperCase())}
                  className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-surface p-1 [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0" />
                <Input id={`t-${k}`} value={theme.colors[k]} maxLength={7} onChange={(e) => setColor(k, e.target.value)}
                  spellCheck={false} {...noFill} className="font-mono text-[13px] uppercase"
                  aria-invalid={issue?.path[0] === "colors" && issue.path[1] === k ? true : undefined} />
              </div>
            </div>
          ); })}
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-[14px] font-semibold">{t("fontLegend")}</legend>
          <Field id="t-body" label={t("bodyFont")}>
            <Input id="t-body" list="t-font-list" value={theme.font.body} onChange={(e) => set({ font: { ...theme.font, body: e.target.value } })} {...noFill} />
          </Field>
          <Field id="t-heading" label={t("headingFont")} optional>
            <Input id="t-heading" list="t-font-list" value={theme.font.heading ?? ""} placeholder={theme.font.body}
              onChange={(e) => set({ font: { ...theme.font, heading: e.target.value || undefined } })} {...noFill} />
          </Field>
          <datalist id="t-font-list">{FONT_CATALOGUE.map((f) => <option key={f} value={f} />)}</datalist>
          <Field id="t-source" label={t("fontSource")}>
            <Select value={theme.font.source} onValueChange={(v) => set({ font: { ...theme.font, source: v as Theme["font"]["source"] } })}>
              <SelectTrigger id="t-source" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="google">Google Fonts</SelectItem>
                <SelectItem value="system">{t("sourceSystem")}</SelectItem>
                <SelectItem value="custom">{t("sourceCustom")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="t-density" label={t("density")}>
            <Select value={theme.density} onValueChange={(v) => set({ density: v as Theme["density"] })}>
              <SelectTrigger id="t-density" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">{t("comfortable")}</SelectItem>
                <SelectItem value="compact">{t("compact")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <p className={cn(hint, "sm:col-span-2")}>{t("sourceHint")}</p>
          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="t-radius" className="text-[14px] font-semibold">{t("radius")}</Label>
              <span className="text-[13px] text-muted-foreground tabular-nums">{theme.radius} px</span>
            </div>
            <input id="t-radius" type="range" min={0} max={24} value={theme.radius} onChange={(e) => set({ radius: Number(e.target.value) })}
              className="h-9 w-full cursor-pointer accent-primary" />
          </div>
          <Field id="t-logo" label={t("logo")} optional hint={t("logoHint")}>
            <Input id="t-logo" type="url" value={theme.logoUrl ?? ""} placeholder="https://…/logo.svg" {...noFill}
              onChange={(e) => set({ logoUrl: e.target.value || undefined })} />
          </Field>
        </fieldset>

        {issue && (
          <p role="alert" className="text-[14px] font-medium text-destructive">
            {issue.path[0] === "colors" ? t("badColor", { label: COLORS.includes(issue.path[1] as keyof Theme["colors"]) ? tagLabel(issue.path[1] as keyof Theme["colors"]) : String(issue.path[1]) })
              : issue.path[0] === "logoUrl" ? t("badLogo")
              : `${issue.path.map(String).join(".")}: ${issue.message}`}
          </p>
        )}
        {(warnings.length > 0 || adjusted.length > 0) && (
          <div role="status" className="grid gap-1.5 rounded-lg border border-warn/40 bg-warn/10 p-4 text-[14px]">
            <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-4 text-warn" aria-hidden />{t("lowContrast")}</p>
            <ul className="grid gap-0.5 pl-6">
              {warnings.map((w) => <li key={w.token}>{warn[w.token] ?? w.token}: {t("contrast")} {locale === "en" ? String(w.ratio) : String(w.ratio).replace(".", ",")}:1</li>)}
              {adjusted.map((k) => (
                <li key={`adj-${k}`}>{t("adjusted", { label: tagLabel(k), from: theme.colors[k].toUpperCase(), to: rendered!.light[k] })}</li>
              ))}
            </ul>
            <p className={hint}>{t("contrastHint")}</p>
          </div>
        )}
        <div className="grid gap-3">
          <Result error={state.error} ok={state.ok} />
          <div><Button type="submit" disabled={pending || !parsed.success} aria-busy={pending || undefined}>{pending ? s("saving") : t("save")}</Button></div>
        </div>
      </form>

      <section aria-label={t("previewLabel")} className="grid gap-2 xl:sticky xl:top-24">
        <p className="text-[13px] font-semibold text-muted-foreground">{t("preview")}</p>
        {fonts && <link rel="stylesheet" href={fonts} />}
        <style>{css}</style>
        <div aria-hidden className={cn("oz-theme-preview grid gap-4 rounded-xl border bg-background p-4 font-sans text-foreground")}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {theme.logoUrl && <img src={theme.logoUrl} alt="" className="h-6 w-auto max-w-[100px] object-contain" />}
              <span className="truncate font-heading text-[15px] font-bold">{t("ideas")}</span>
            </span>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground">
              <Plus className="size-3.5" />{t("suggest")}
            </span>
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border bg-surface">
            {SAMPLE.map((r, i) => (
              <li key={r.n} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-3 py-3">
                <span className={cn(
                  "grid h-12 w-10 place-items-center content-center gap-0.5 rounded-lg border font-heading text-[14px] font-bold tabular-nums",
                  i === 0 ? "border-brand bg-brand text-primary-foreground" : "border-line-strong",
                )}>
                  <ChevronUp className="size-3.5" strokeWidth={2.5} />{r.votes}
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] leading-snug font-semibold">{sample[i]?.title}</p>
                  <p className="line-clamp-1 text-[13px] text-muted-foreground">{sample[i]?.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    <StatusTag kind="idea" status={r.status} className="text-[12px]" />
                    <span>#{r.n}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{r.comments}</span>
                  </div>
                  <RouteRail kind="idea" status={r.status} className="mt-2" />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] text-muted-foreground">{t("previewNote")}</p>
        </div>
      </section>
    </div>
  );
}
