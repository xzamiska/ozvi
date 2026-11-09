"use client";

import { Languages, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { translatePostsAction, type ShownTranslation } from "@/lib/translate-actions";
import { cn } from "@/lib/utils";

/**
 * Post translation on boards. The server decides which posts are in another language (`foreign`),
 * which translations are already cached (`initial`, rendered translated right away in automatic mode)
 * and re-checks permissions on every request. Each translation is labelled "translated with AI" and
 * the original is one click away (AI Act art. 50); the model is in the tooltip and data attributes.
 */

type Subject = "item" | "comment" | "changelog";
export interface ForeignPost { subject: Subject; id: string }

interface State {
  mode: "on_demand" | "auto";
  foreign: Set<string>;
  done: Record<string, ShownTranslation>;
  showing: Record<string, boolean>;
  busy: Set<string>;
  errors: Record<string, string>;
  request: (ids: string[], quiet?: boolean) => void;
  toggle: (id: string) => void;
}
const Ctx = createContext<State | null>(null);

/** Wraps a page region whose posts may be translated; with `view` null (translation off) it renders just the children. */
export function TranslationScope({ slug, view, children }: {
  slug: string; view: { mode: "on_demand" | "auto"; foreign: ForeignPost[]; initial: ShownTranslation[] } | null; children: React.ReactNode;
}) {
  return view ? <Scope slug={slug} {...view}>{children}</Scope> : <>{children}</>;
}

function Scope({ slug, mode, foreign, initial, children }: {
  slug: string; mode: "on_demand" | "auto"; foreign: ForeignPost[]; initial: ShownTranslation[]; children: React.ReactNode;
}) {
  const subjects = useMemo(() => new Map(foreign.map((f) => [f.id, f.subject])), [foreign]);
  const [done, setDone] = useState<Record<string, ShownTranslation>>(() => Object.fromEntries(initial.map((x) => [x.id, x])));
  // Automatic mode shows translations first; on request only after a click.
  const [showing, setShowing] = useState<Record<string, boolean>>(() => mode === "auto" ? Object.fromEntries(initial.map((x) => [x.id, true])) : {});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, start] = useTransition();
  const asked = useRef(new Set<string>());

  // quiet: automatic translation on page load; a failure then just leaves the "Translate" button, no error text.
  const request = useCallback((ids: string[], quiet = false) => {
    const todo = ids.filter((id) => subjects.has(id) && !asked.current.has(id));
    if (todo.length === 0) return;
    todo.forEach((id) => asked.current.add(id));
    setBusy((b) => new Set([...b, ...todo]));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !todo.includes(k))));
    start(async () => {
      try {
        const res = await translatePostsAction(slug, todo.map((id) => ({ subject: subjects.get(id)!, id })));
        setDone((d) => ({ ...d, ...Object.fromEntries(res.translations.map((x) => [x.id, x])) }));
        setShowing((s) => ({ ...s, ...Object.fromEntries(res.translations.map((x) => [x.id, true])) }));
        const failed = todo.filter((id) => !res.translations.some((x) => x.id === id));
        if (failed.length && !quiet) setErrors((e) => ({ ...e, ...Object.fromEntries(failed.map((id) => [id, res.errors[id] ?? res.error ?? ""])) }));
        failed.forEach((id) => asked.current.delete(id));
      } catch {
        todo.forEach((id) => asked.current.delete(id));
      } finally {
        setBusy((b) => new Set([...b].filter((id) => !todo.includes(id))));
      }
    });
  }, [slug, subjects]);

  const toggle = useCallback((id: string) => {
    if (done[id]) setShowing((s) => ({ ...s, [id]: !s[id] }));
    else request([id]);
  }, [done, request]);

  // Automatic mode: translate what the cache did not have, once, after the page is shown.
  useEffect(() => {
    if (mode !== "auto") return;
    const missing = foreign.map((f) => f.id).filter((id) => !initial.some((x) => x.id === id));
    if (missing.length) request(missing, true);
  }, [mode, foreign, initial, request]);

  const value = useMemo<State>(() => ({ mode, foreign: new Set(subjects.keys()), done, showing, busy, errors, request, toggle }),
    [mode, subjects, done, showing, busy, errors, request, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useShown(id: string) {
  const s = useContext(Ctx);
  const t = s?.done[id];
  return s && t && s.showing[id] ? t : null;
}

/** The title of a post: translated when the reader chose (or the board shows) the translation. */
export function TranslatedTitle({ id, children }: { id: string; children: React.ReactNode }) {
  const t = useShown(id);
  return t?.title ? <span data-ai-generated="true">{t.title}</span> : <>{children}</>;
}

/** The body of a post: the original (server-rendered Markdown) or the translation, rendered the same way. */
export function TranslatedBody({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const t = useShown(id);
  // The HTML comes from lib/markdown.ts on the server, which escapes everything (same as <Markdown>).
  return t ? <div className={cn("oz-prose oz-md", className)} data-ai-generated="true" data-ai-model={t.model} dangerouslySetInnerHTML={{ __html: t.html }} /> : <>{children}</>;
}

/**
 * The line under a foreign post: "Written in another language · Translate", or once translated
 * "Translated with AI · show original". Nothing for posts in the reader's language.
 */
export function TranslateBar({ id, className }: { id: string; className?: string }) {
  const s = useContext(Ctx);
  const t = useTranslations("translate");
  if (!s || !s.foreign.has(id)) return null;
  const tr = s.done[id];
  const showing = !!tr && !!s.showing[id];
  const busy = s.busy.has(id);
  const error = s.errors[id];
  const link = "inline-flex min-h-6 items-center rounded-sm font-medium text-foreground underline decoration-line-strong underline-offset-[3px] hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:no-underline disabled:opacity-60";
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground", className)} aria-live="polite">
      {showing ? (
        <>
          <span className="inline-flex items-center gap-1.5" title={t("model", { model: tr.model })} data-ai-generated="true" data-ai-model={tr.model}>
            <Sparkles aria-hidden className="size-3.5 shrink-0" />{t("label")}<span className="sr-only"> ({t("model", { model: tr.model })})</span>
          </span>
          <span aria-hidden>·</span>
          <button type="button" className={link} onClick={() => s.toggle(id)}>{t("showOriginal")}</button>
        </>
      ) : (
        <>
          <Languages aria-hidden className="size-3.5 shrink-0" />
          <span>{tr ? t("original") : t("foreign")}</span>
          <span aria-hidden>·</span>
          <button type="button" className={link} disabled={busy} aria-busy={busy || undefined} onClick={() => s.toggle(id)}>
            {busy ? t("working") : tr ? t("showTranslation") : t("action")}
          </button>
          {error && <span role="alert" className="basis-full text-destructive">{error}</span>}
        </>
      )}
    </p>
  );
}
