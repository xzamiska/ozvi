"use client";

import { Check, Copy, FileCode2, FileText, Scale } from "lucide-react";
import { createTranslator, useTranslations } from "next-intl";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOCALE_NAME, LOCALE_TAG, LOCALES, type Locale } from "@/i18n/locales";
import {
  buildKit, CAPTURES, kitHtml, kitMarkdown, sectionMarkdown, type Block, type Capture, type KitConfig, type KitT,
} from "@/lib/privacy-kit";
import { hint } from "./settings-base";

/** Copies plain text, or HTML (as rich text plus its source as plain text) when `html` is set. */
function CopyBtn({ text, html, label, srLabel, icon, variant = "outline" }: {
  text: string; html?: boolean; label: string; srLabel?: string; icon?: React.ReactNode; variant?: "outline" | "default";
}) {
  const t = useTranslations("admin.privacyKit");
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const id = setTimeout(() => setState("idle"), 2500);
    return () => clearTimeout(id);
  }, [state]);
  const run = async () => {
    try {
      if (html && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([text], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
      } else await navigator.clipboard.writeText(text);
      setState("done");
    } catch { setState("fail"); }
  };
  return (
    <span className="inline-grid gap-1">
      <Button type="button" variant={variant} size="sm" onClick={run}>
        {state === "done" ? <Check /> : icon ?? <Copy />}
        <span>{state === "done" ? t("copied") : label}{srLabel && <span className="sr-only">: {srLabel}</span>}</span>
      </Button>
      <span role="status" className="sr-only">{state === "done" ? t("copied") : ""}</span>
      {state === "fail" && <span role="alert" className="text-[12.5px] text-destructive">{t("copyFailed")}</span>}
    </span>
  );
}

/** Plain text with bare URLs as links. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+?)(?=[.,;:)]?(?:\s|$))/g);
  return <>{parts.map((p, i) => (i % 2 ? <a key={i} href={p} className="oz-link break-all" target="_blank" rel="noopener">{p}</a> : <Fragment key={i}>{p}</Fragment>))}</>;
}

function BlockView({ b, caption }: { b: Block; caption: string }) {
  if (b.kind === "p") return <p className="max-w-[72ch]"><Linked text={b.text} /></p>;
  if (b.kind === "ul") return <ul className="grid max-w-[72ch] list-disc gap-1.5 pl-5 marker:text-muted-foreground">{b.items.map((i) => <li key={i}><Linked text={i} /></li>)}</ul>;
  return (
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto rounded-lg border focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
        <thead className="bg-muted/60">
          <tr>{b.head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y">
          {b.rows.map((r) => (
            <tr key={r[0]} className="align-top">
              {r.map((c, i) => i === 0
                ? <th key={i} scope="row" className="px-3 py-2 font-normal"><code className="font-mono text-[12px] break-all">{c}</code></th>
                : <td key={i} className="px-3 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Admin → Dáta projektu → #privacy-kit: privacy-policy paragraphs from the project's real configuration,
 * in any board language, with copy per section and for everything (Markdown / HTML).
 */
export function PrivacyKit({ config, messages, initialLocale, email, subprocessorsUrl }: {
  config: Omit<KitConfig, "capture"> & { capture: Record<Capture, boolean> };
  /** The "privacyKit" namespace in every locale (small; the generator runs in the browser). */
  messages: Record<Locale, unknown>;
  initialLocale: Locale;
  email: string;
  subprocessorsUrl: string | null;
}) {
  const t = useTranslations("admin.privacyKit");
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [capture, setCapture] = useState(config.capture);

  const kit = useMemo(() => {
    const tr = createTranslator({ locale, messages: { privacyKit: messages[locale] } as never, namespace: "privacyKit" as never }) as unknown as KitT;
    return buildKit({ ...config, capture }, tr, locale);
  }, [config, capture, locale, messages]);
  const md = useMemo(() => kitMarkdown(kit), [kit]);
  const html = useMemo(() => kitHtml(kit), [kit]);

  return (
    <div className="grid gap-4">
      <Alert role="note" className="border-st-ack/40">
        <Scale className="text-st-ack" />
        <AlertTitle>{t("legalTitle")}</AlertTitle>
        <AlertDescription>
          <p>{t("legal")}</p>
          <p>
            {config.mode === "cloud" ? t("cloud", { email }) : t("self")}
            {subprocessorsUrl && <> <a href={subprocessorsUrl} className="oz-link">{t("subprocessors")}</a></>}
          </p>
        </AlertDescription>
      </Alert>

      <div className="grid gap-5 rounded-xl border bg-surface p-5 sm:p-6">
        <div className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
          <div className="grid content-start gap-2">
            <Label htmlFor="privacy-kit-lang" className="text-[14px] font-semibold">{t("language")}</Label>
            <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
              <SelectTrigger id="privacy-kit-lang" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => <SelectItem key={l} value={l} lang={LOCALE_TAG[l]}>{LOCALE_NAME[l]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="grid min-w-0 gap-2">
            <legend className="text-[14px] font-semibold">{t("captureTitle")}</legend>
            <p className={hint}>{t("captureHint")}</p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
              {CAPTURES.map((c) => (
                <div key={c} className="flex min-h-6 items-center gap-2">
                  <Checkbox id={`kit-cap-${c}`} checked={capture[c]} onCheckedChange={(v) => setCapture((x) => ({ ...x, [c]: v === true }))} />
                  <Label htmlFor={`kit-cap-${c}`} className="text-[14px] font-normal">{t(`cap.${c}`)}</Label>
                </div>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-5">
          <CopyBtn text={md} label={t("copyMd")} icon={<FileText />} variant="default" />
          <CopyBtn text={html} html label={t("copyHtml")} icon={<FileCode2 />} />
        </div>
      </div>

      <div className="grid divide-y rounded-xl border bg-surface">
        {kit.sections.map((s) => (
          <div key={s.id} className="grid gap-3 p-5 text-[14px] leading-relaxed sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <h4 id={`kit-${s.id}`} lang={LOCALE_TAG[locale]} className="text-[15px] font-semibold">{s.title}</h4>
              <CopyBtn text={sectionMarkdown(s)} label={t("copy")} srLabel={s.title} />
            </div>
            <div lang={LOCALE_TAG[locale]} className="grid gap-3">{s.blocks.map((b, i) => <BlockView key={i} b={b} caption={s.title} />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
