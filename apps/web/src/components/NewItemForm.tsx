"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addComment, attachToIdea, createItem, type CreateState, type FormState } from "@/lib/actions";
import { browserLabel } from "@/lib/format";
import { Check, ExternalLink, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "./MarkdownEditor";
import { cn } from "@/lib/utils";
import { FileDrop } from "./FileDrop";
import { Honeypot } from "./Honeypot";
import { StatusTag } from "./ozvi/route";
import { VoteButton, type VoteMode } from "./VoteButton";
import { DRAFT_PREFIX } from "@/lib/storage-keys";

/** /[project]/search: findSimilar at the SHOW threshold, with the viewer's own vote. */
interface Similar { id: string; number: number; title: string; votes: number; status: string; score: number; weight: number }

/** Listed in the privacy kit (lib/storage-keys.ts): the tab keeps the draft until it is sent or closed. */
const draftKey = (slug: string, kind: string) => `${DRAFT_PREFIX}${slug}:${kind}`;
function readDraft(key: string): { title?: string; body?: string } | null {
  try { return JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { return null; }
}
function writeDraft(key: string, d: { title: string; body: string } | null) {
  try { if (d && (d.title || d.body)) sessionStorage.setItem(key, JSON.stringify(d)); else sessionStorage.removeItem(key); } catch { /* storage off */ }
}

/**
 * New idea or bug. Ideas: up to 3 similar ideas while writing (the team's matcher, ADR-0015) with status and
 * votes, voting in place, and the draft as a comment there; on submit the server may ask once about a strong
 * match. The draft (title, body) is kept in sessionStorage, so opening a suggestion or signing in loses nothing.
 * `login`: null = signed in; otherwise a guest on a public board, who sees suggestions and signs in to post.
 */
export function NewItemForm({ slug, kind, prefill, vote = { mode: "simple", left: null }, login = null }: {
  slug: string; kind: "bug" | "idea"; prefill: { url?: string; appVersion?: string };
  vote?: { mode: VoteMode; left: number | null };
  login?: string | null;
}) {
  const [state, action, pending] = useActionState((p: CreateState, f: FormData) => createItem(slug, p, f), {});
  const strong = state.strong;
  // Asked once per draft: after the question, every submit says "it's something else" (also after an error).
  const [asked, setAsked] = useState<{ number: number } | null>(null);
  useEffect(() => { if (state.strong) setAsked(state.strong); }, [state]);
  const [attachState, attach, attaching] = useActionState((p: FormState, f: FormData) => strong ? attachToIdea(slug, strong.number, p, f) : Promise.resolve(p), {});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [restored, setRestored] = useState(false);
  const [similar, setSimilar] = useState<Similar[]>([]);
  // What the author was shown (number → best score), and which suggestions they voted on or opened.
  const shown = useRef(new Map<number, number>());
  const [seen, setSeen] = useState<number[]>([]);
  const [voted, setVoted] = useState<Record<number, boolean>>({});
  const [ctx, setCtx] = useState<Record<string, string>>({});
  const bug = kind === "bug";
  const guest = login !== null;
  const key = draftKey(slug, kind);
  const tf = useTranslations("forms");
  const t = useTranslations("forms.newItem");
  const see = (n: number) => setSeen((s) => (s.includes(n) ? s : [...s, n]));

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

  // The draft comes back after opening a suggestion, signing in or reloading; every edit is kept.
  useEffect(() => {
    const d = readDraft(key);
    if (d) { setTitle((x) => x || d.title || ""); setBody((x) => x || d.body || ""); }
    setRestored(true);
  }, [key]);
  useEffect(() => { if (restored) writeDraft(key, { title, body }); }, [restored, key, title, body, state, attachState]);

  useEffect(() => {
    if (bug || title.trim().length < 4) { setSimilar([]); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/${slug}/search?q=${encodeURIComponent(title)}`, { signal: ctrl.signal })
        .then((r) => r.json()).then((rows: Similar[]) => {
          for (const r of rows) shown.current.set(r.number, Math.max(r.score, shown.current.get(r.number) ?? 0));
          setSimilar(rows);
        }).catch(() => {});
    }, 250);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [bug, slug, title]);

  const path = (() => { try { return ctx.url ? new URL(ctx.url, location.origin).pathname : ""; } catch { return ctx.url ?? ""; } })();
  const summary = [path, ctx.appVersion && `v${ctx.appVersion}`, ctx.browser && browserLabel(ctx.browser)]
    .filter(Boolean).join(" · ");
  const clearDraft = () => { setTitle(""); setBody(""); writeDraft(key, null); setSimilar([]); };

  return (
    // Every submit (create or attach) clears the stored draft; it is written again if the server answers without leaving.
    <form action={action} className="grid gap-6" onSubmit={(e) => { if (guest) e.preventDefault(); else writeDraft(key, null); }}>
      <Honeypot />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="context" value={JSON.stringify(ctx)} />
      {!bug && <>
        <input type="hidden" name="seen" value={[...seen, ...(asked ? [asked.number] : [])].join(",")} />
        <input type="hidden" name="shown" value={JSON.stringify([...shown.current].map(([number, score]) => ({ number, score })))} />
        {/* Asked once: the only way to create from the question is "it's something else". */}
        {asked && <><input type="hidden" name="confirmedNew" value="1" /><input type="hidden" name="strong" value={asked.number} /></>}
      </>}

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
        <section aria-live="polite" aria-label={t("similarLabel")} className="grid gap-3 rounded-xl border border-brand-line bg-brand-soft/60 p-4">
          <p className="text-[14px] font-semibold">{t("similar")}</p>
          <ul className="grid gap-2">
            {similar.map((s) => (
              <SimilarCard key={s.number} slug={slug} s={s} vote={vote} guest={guest} login={login}
                draft={{ title, body }} voted={voted[s.number] ?? s.weight > 0}
                onVoted={(w) => { see(s.number); setVoted((v) => ({ ...v, [s.number]: w > 0 })); }}
                onOpen={() => see(s.number)} onCommented={clearDraft} />
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-2">
        <label className="text-[14px] font-semibold" htmlFor="f-body">
          {bug ? t("bodyBug") : t("bodyIdea")} <span className="font-normal text-muted-foreground">{tf("optional")}</span>
        </label>
        <MarkdownEditor slug={slug} id="f-body" name="body" rows={5} maxLength={10000} className="min-h-[132px] text-[15px]"
          value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={bug ? t("bodyPlaceholderBug") : t("bodyPlaceholderIdea")} />
      </div>

      {!guest && <FileDrop label={bug ? t("filesBug") : t("filesIdea")} hint={bug ? t("filesHintBug") : t("filesHintIdea")} />}

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

      {(attachState.error ?? state.error) && <p className="text-[14px] font-medium text-destructive" role="alert">{attachState.error ?? state.error}</p>}

      {strong && !bug ? (
        // One question, in place of the submit row: the strong match, or a new idea with an optional reason.
        <section aria-labelledby="strong-h" role="group" className="grid gap-4 rounded-xl border border-brand-line bg-brand-soft/60 p-5">
          <div className="grid gap-1.5">
            <h2 id="strong-h" className="font-heading text-[16px] font-bold">{t("strongTitle", { n: strong.number })}</h2>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14.5px]">
              <a href={`/${slug}/i/${strong.number}`} target="_blank" rel="noopener" className="oz-link font-medium" onClick={() => see(strong.number)}>
                #{strong.number} {strong.title}<span className="sr-only"> ({t("newWindow")})</span>
                <ExternalLink aria-hidden className="ml-1 inline size-3.5 align-[-2px]" />
              </a>
              <StatusTag kind="idea" status={strong.status} />
              <span className="text-[13px] text-muted-foreground tabular-nums">{tf("vote.count", { count: strong.votes })}</span>
            </p>
            <p className="text-[14px] text-muted-foreground">{t("strongText")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" formAction={attach} aria-busy={attaching || undefined} disabled={attaching || pending}>
              {attaching ? t("attaching") : t("strongAttach", { n: strong.number })}
            </Button>
          </div>
          <div className="grid gap-2 border-t border-brand-line pt-4">
            <label className="text-[13.5px] font-semibold" htmlFor="f-reason">
              {t("strongReason")} <span className="font-normal text-muted-foreground">{tf("optional")}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Input id="f-reason" name="reason" maxLength={200} autoComplete="off" className="h-10 min-w-0 flex-1 basis-60 bg-surface" />
              <Button type="submit" variant="outline" size="lg" aria-busy={pending || undefined} disabled={pending || attaching}>
                {pending ? t("sending") : t("strongNew")}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-3 border-t pt-6">
          {guest && <p className="text-[13.5px] text-muted-foreground">{t("guestNote")}</p>}
          <div className="flex flex-wrap items-center gap-3">
            {guest
              ? <Button asChild size="lg"><a href={login!}>{t("guestSubmit")}</a></Button>
              : <Button type="submit" size="lg" aria-busy={pending || undefined} disabled={pending}>
                  {pending ? t("sending") : bug ? t("submitBug") : t("submitIdea")}
                </Button>}
            <Button asChild variant="ghost" size="lg"><Link href={`/${slug}/${bug ? "bugs" : "ideas"}`}>{tf("cancel")}</Link></Button>
          </div>
        </div>
      )}
    </form>
  );
}

/** One suggestion: vote in place; after voting, the draft can go there as the author's comment. */
function SimilarCard({ slug, s, vote, guest, login, draft, voted, onVoted, onOpen, onCommented }: {
  slug: string; s: Similar; vote: { mode: VoteMode; left: number | null }; guest: boolean; login: string | null;
  draft: { title: string; body: string }; voted: boolean;
  onVoted: (weight: number) => void; onOpen: () => void; onCommented: () => void;
}) {
  const t = useTranslations("forms.newItem");
  const [sending, start] = useTransition();
  const [done, setDone] = useState<"added" | "queued" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const text = [draft.title.trim(), draft.body.trim()].filter(Boolean).join("\n\n");

  function comment() {
    if (sending || draft.title.trim().length < 3) return;
    setError(null);
    start(async () => {
      const f = new FormData();
      f.set("body", text);
      f.set("via", "similar");
      const r = await addComment(slug, s.id, {}, f);
      if (r.error) { setError(r.error); return; }
      setDone(r.queued ? "queued" : "added");
      onCommented();
    });
  }

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg bg-surface p-2.5">
      <VoteButton slug={slug} itemId={s.id} count={s.votes} voted={s.weight > 0} weight={s.weight || undefined}
        mode={vote.mode} left={vote.left} login={guest ? login : null} onVoted={onVoted} />
      <div className="grid min-w-0 gap-1.5">
        <a href={`/${slug}/i/${s.number}`} target="_blank" rel="noopener" onClick={onOpen}
          className="text-[14.5px] font-medium leading-snug hover:underline">
          <span className="text-muted-foreground tabular-nums">#{s.number}</span> {s.title}
          <span className="sr-only"> ({t("newWindow")})</span>
        </a>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusTag kind="idea" status={s.status} />
          <a href={`/${slug}/i/${s.number}`} target="_blank" rel="noopener" onClick={onOpen}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            aria-label={`${t("view")} #${s.number} (${t("newWindow")})`}>
            {t("view")}<ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
        {done ? (
          <p role="status" className="flex items-start gap-1.5 text-[13.5px]">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{t(done === "queued" ? "commentQueued" : "commentAdded", { n: s.number })}{" "}
              <a className="oz-link" href={`/${slug}/i/${s.number}`}>{t("openIdea", { n: s.number })}</a></span>
          </p>
        ) : voted && !guest && (
          <div className="grid gap-1.5">
            <p role="status" className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Check aria-hidden className="size-3.5" />{t("voted", { n: s.number })}</p>
            <div>
              <Button type="button" variant="outline" size="sm" onClick={comment} aria-busy={sending || undefined}
                aria-disabled={draft.title.trim().length < 3 || undefined} aria-describedby={draft.title.trim().length < 3 ? `wf-${s.number}` : undefined}>
                {sending ? t("addingComment") : t("addAsComment", { n: s.number })}
              </Button>
              {draft.title.trim().length < 3 && <p id={`wf-${s.number}`} className="mt-1 text-[12.5px] text-muted-foreground">{t("writeFirst")}</p>}
            </div>
            {error && <p role="alert" className="text-[13px] text-destructive">{error}</p>}
          </div>
        )}
      </div>
    </li>
  );
}
