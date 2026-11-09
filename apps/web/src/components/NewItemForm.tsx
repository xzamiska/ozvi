"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createItem, type FormState } from "@/lib/actions";
import { browserLabel } from "@/lib/format";
import { ChevronUp, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "./MarkdownEditor";
import { cn } from "@/lib/utils";
import { FileDrop } from "./FileDrop";
import { Honeypot } from "./Honeypot";

interface Similar { number: number; title: string; votes: number; status: string }

export function NewItemForm({ slug, kind, prefill }: {
  slug: string; kind: "bug" | "idea"; prefill: { url?: string; appVersion?: string };
}) {
  const [state, action, pending] = useActionState((p: FormState, f: FormData) => createItem(slug, p, f), {});
  const [title, setTitle] = useState("");
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [ctx, setCtx] = useState<Record<string, string>>({});
  const bug = kind === "bug";
  const tf = useTranslations("forms");
  const t = useTranslations("forms.newItem");

  useEffect(() => {
    if (!bug) return;
    setCtx({
      url: prefill.url ?? document.referrer ?? "",
      appVersion: prefill.appVersion ?? "",
      browser: navigator.userAgent,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      language: navigator.language,
    });
  }, [bug, prefill.url, prefill.appVersion]);

  useEffect(() => {
    if (bug || title.trim().length < 4) { setSimilar([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/${slug}/search?q=${encodeURIComponent(title)}`, { signal: ctrl.signal })
        .then((r) => r.json()).then(setSimilar).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [bug, slug, title]);

  const path = (() => { try { return ctx.url ? new URL(ctx.url, location.origin).pathname : ""; } catch { return ctx.url ?? ""; } })();
  const summary = [path, ctx.appVersion && `v${ctx.appVersion}`, ctx.browser && browserLabel(ctx.browser)]
    .filter(Boolean).join(" · ");

  return (
    <form action={action} className="grid gap-6">
      <Honeypot />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="context" value={JSON.stringify(ctx)} />

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-[14px] font-semibold" htmlFor="f-title">{bug ? t("titleBug") : t("titleIdea")}</label>
          <span className={cn("text-xs tabular-nums text-muted-foreground", title.length > 180 && "font-semibold text-st-ack")}>{title.length}/200</span>
        </div>
        <Input id="f-title" name="title" required minLength={3} maxLength={200} value={title} autoFocus autoComplete="off"
          onChange={(e) => setTitle(e.target.value)} className="h-11 bg-surface text-[16px]"
          placeholder={bug ? t("placeholderBug") : t("placeholderIdea")} />
      </div>

      {similar.length > 0 && (
        <section aria-live="polite" aria-label={t("similarLabel")} className="grid gap-2 rounded-xl border border-brand-line bg-brand-soft/60 p-4">
          <p className="text-[14px] font-semibold">{t("similar")}</p>
          <ul className="grid gap-1">
            {similar.map((s) => (
              <li key={s.number}>
                <Link href={`/${slug}/i/${s.number}`} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-[14px] hover:bg-surface">
                  <span className="inline-flex w-10 shrink-0 items-center gap-0.5 text-[12.5px] font-bold text-muted-foreground tabular-nums"><ChevronUp className="size-3.5" />{s.votes}</span>
                  <span className="font-medium">{s.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-2">
        <label className="text-[14px] font-semibold" htmlFor="f-body">
          {bug ? t("bodyBug") : t("bodyIdea")} <span className="font-normal text-muted-foreground">{tf("optional")}</span>
        </label>
        <MarkdownEditor slug={slug} id="f-body" name="body" rows={5} maxLength={10000} className="min-h-[132px] text-[15px]"
          placeholder={bug ? t("bodyPlaceholderBug") : t("bodyPlaceholderIdea")} />
      </div>

      <FileDrop label={bug ? t("filesBug") : t("filesIdea")} hint={bug ? t("filesHintBug") : t("filesHintIdea")} />

      {bug && summary && (
        <details className="group rounded-xl border bg-surface">
          {/* Label and summary stack, so the summary is never cut off on a phone. */}
          <summary className="grid cursor-pointer list-none grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-2.5 gap-y-0.5 px-4 py-3 text-[13.5px]">
            <Lock className="mt-[3px] size-3.5 text-muted-foreground" />
            <span className="font-semibold">{t("context")}</span>
            <span className="text-xs font-medium text-muted-foreground group-open:hidden">{t("show")}</span>
            <span className="col-start-2 col-end-4 break-words text-muted-foreground">{summary}</span>
          </summary>
          <dl className="grid gap-x-6 gap-y-2 border-t px-4 py-3 text-[13px] sm:grid-cols-[130px_1fr]">
            {ctx.url && <><dt className="text-muted-foreground">{t("page")}</dt><dd className="break-all">{ctx.url}</dd></>}
            {ctx.appVersion && <><dt className="text-muted-foreground">{t("appVersion")}</dt><dd>{ctx.appVersion}</dd></>}
            {ctx.browser && <><dt className="text-muted-foreground">{t("browser")}</dt><dd className="break-all">{ctx.browser}</dd></>}
            {ctx.viewport && <><dt className="text-muted-foreground">{t("viewport")}</dt><dd>{ctx.viewport}</dd></>}
            {ctx.language && <><dt className="text-muted-foreground">{t("language")}</dt><dd>{ctx.language}</dd></>}
          </dl>
        </details>
      )}

      {state.error && <p className="text-[14px] font-medium text-destructive" role="alert">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button type="submit" size="lg" aria-busy={pending || undefined} disabled={pending}>
          {pending ? t("sending") : bug ? t("submitBug") : t("submitIdea")}
        </Button>
        <Button asChild variant="ghost" size="lg"><Link href={`/${slug}/${bug ? "bugs" : "ideas"}`}>{tf("cancel")}</Link></Button>
      </div>
    </form>
  );
}
