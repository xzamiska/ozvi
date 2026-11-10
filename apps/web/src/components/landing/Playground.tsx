"use client";

import { checkContrast, fontsHref, parseTheme, toCss, type ThemeInput } from "@ozvi/theme";
import { ArrowLeft, Check, ChevronUp, Copy, Lock, MessageSquare, Plus, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { StatusMark } from "@/components/ozvi/route";
import { cn } from "@/lib/utils";

/**
 * A working board with a theme editor beside it. Every control writes a field of theme.json and
 * the board re-themes through the same toCss() the real board uses; the board itself is local
 * state (votes, new ideas, comments), so visitors can use it the way their users would.
 */

const ACCENTS = ["#5A3FE6", "#1D4ED8", "#0E7C66", "#C2410C", "#BE185D", "#0F172A"];
const BASES = {
  neutral: { ink: "#111827", surface: "#FFFFFF", canvas: "#F4F5F7", border: "#E3E5EA" },
  warm: { ink: "#2B2118", surface: "#FFFDF9", canvas: "#F5EFE6", border: "#E7DCCD" },
  cool: { ink: "#0F1B2D", surface: "#FFFFFF", canvas: "#EDF2F8", border: "#D8E1EC" },
  dark: { ink: "#ECEDF2", surface: "#17181D", canvas: "#0F1013", border: "#2B2D35" },
} as const;
type Base = keyof typeof BASES;
const FONTS = ["Geist", "Inter", "IBM Plex Sans", "Figtree", "Nunito Sans", "Space Grotesk", "Fraunces"];
const START = { name: "", accent: ACCENTS[0]!, base: "neutral" as Base, font: "Geist", radius: 8, density: "comfortable" as "comfortable" | "compact" };

type IdeaStatus = "open" | "planned" | "in_progress" | "shipped";
type Idea = { id: number; title: string; text: string; author: string; votes: number; voted: boolean; status: IdeaStatus; comments: [string, string][]; mine?: boolean };
export type View = "ideas" | "roadmap" | "news" | "bugs";
/** checkContrast() token names → message keys (playground.controls.tokens). */
const TOKENS: Record<string, "inkOnSurface" | "inkOnCanvas" | "accentOnSurface" | "buttonOnAccent"> = {
  "ink on surface": "inkOnSurface", "ink on canvas": "inkOnCanvas", "accent on surface": "accentOnSurface", "button text on accent": "buttonOnAccent",
};
const VIEWS: View[] = ["ideas", "roadmap", "news", "bugs"];

/** Sample content: texts live in messages (playground.board.ideas / bugs, same order), the rest here. */
type IdeaText = { title: string; text: string; author: string; comments: [string, string][] };
type News = { v: string; date: string; title: string; text: string };
const IDEAS: { votes: number; status: IdeaStatus }[] = [{ votes: 41, status: "planned" }, { votes: 17, status: "in_progress" }, { votes: 9, status: "open" }];
const BUGS: { n: number; status: "new" | "fixed"; v: string | null }[] = [{ n: 128, status: "fixed", v: "2.15" }, { n: 131, status: "new", v: null }];

export function Playground() {
  const t = useTranslations("playground");
  const [s, setS] = useState({ ...START, name: "" });
  const [panel, setPanel] = useState<"ui" | "json">("ui");
  const [copied, setCopied] = useState(false);
  const name = s.name.trim() || "Acme";

  const input: ThemeInput = useMemo(() => ({
    name, colors: { accent: s.accent, ...BASES[s.base] },
    font: { body: s.font, source: "google" }, radius: s.radius, density: s.density,
  }), [name, s]);
  const theme = useMemo(() => parseTheme(input), [input]);
  const css = useMemo(() => toCss(theme, ".pg-board"), [theme]);
  const warnings = useMemo(() => checkContrast(theme), [theme]);
  const json = JSON.stringify(input, null, 2);

  // Load the chosen font on demand, from Ozvi's own /fonts route (never from Google).
  useEffect(() => {
    const href = fontsHref(theme, { skipBundled: true });
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    document.head.appendChild(l);
  }, [theme]);

  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));
  const tabKeys = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = panel === "ui" ? "json" : "ui";
    setPanel(next);
    document.getElementById(`pg-tab-${next}`)?.focus();
  };
  const label = "text-[12.5px] font-medium text-muted-foreground";

  return (
    <div className="grid overflow-hidden rounded-2xl border bg-surface lg:grid-cols-[300px_minmax(0,1fr)]">
      <style>{css}</style>

      {/* editor */}
      <div className="order-2 flex min-w-0 flex-col border-t lg:order-1 lg:border-t-0 lg:border-r">
        <div className="flex border-b px-2">
          <div role="tablist" aria-label={t("controls.tablist")} className="flex" onKeyDown={tabKeys}>
          {(["ui", "json"] as const).map((p) => (
            <button key={p} type="button" role="tab" id={`pg-tab-${p}`} aria-selected={panel === p} aria-controls="pg-panel" tabIndex={panel === p ? 0 : -1} onClick={() => setPanel(p)}
              className={cn("relative h-11 px-3 text-[13.5px] font-medium text-muted-foreground hover:text-foreground", p === "json" && "font-mono text-[12.5px]",
                panel === p && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-px after:bg-foreground")}>
              {p === "ui" ? t("controls.ui") : t("controls.json")}
            </button>
          ))}
          </div>
          <button type="button" onClick={() => setS({ ...START })} className="ml-auto inline-flex items-center gap-1 px-2 text-[12.5px] text-muted-foreground hover:text-foreground" aria-label={t("controls.reset")} title={t("controls.reset")}>
            <RotateCcw className="size-3.5" />
          </button>
        </div>

        <div id="pg-panel" role="tabpanel" aria-labelledby={`pg-tab-${panel}`} className="flex min-w-0 flex-1 flex-col">
        {panel === "ui" ? (
          <div className="grid gap-5 p-5">
            <label className="grid gap-1.5">
              <span className={label}>{t("controls.name")}</span>
              <input value={s.name} onChange={(e) => set("name", e.target.value.slice(0, 30))} placeholder={name}
                className="h-9 rounded-md border bg-background px-2.5 text-[14px] focus-visible:border-primary" />
            </label>

            <fieldset className="grid gap-2">
              <legend className={cn(label, "mb-2")}>{t("controls.accent")}</legend>
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((a) => (
                  <button key={a} type="button" onClick={() => set("accent", a)} aria-label={a} aria-pressed={s.accent === a}
                    className={cn("grid size-7 place-items-center rounded-full ring-offset-2 ring-offset-surface", s.accent === a && "ring-2 ring-foreground")} style={{ background: a }}>
                    {s.accent === a && <Check className="size-3.5 text-white" strokeWidth={3} />}
                  </button>
                ))}
                <label className="relative grid size-7 cursor-pointer place-items-center rounded-full border border-dashed border-line-strong" title={t("controls.custom")}>
                  <Plus className="size-3.5 text-muted-foreground" />
                  <input type="color" value={s.accent} onChange={(e) => set("accent", e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("controls.custom")} />
                </label>
                <code className="ml-auto font-mono text-[12px] text-muted-foreground">{s.accent}</code>
              </div>
            </fieldset>

            <fieldset>
              <legend className={cn(label, "mb-2")}>{t("controls.base")}</legend>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(BASES) as Base[]).map((b) => (
                  <button key={b} type="button" onClick={() => set("base", b)} aria-pressed={s.base === b}
                    className={cn("grid gap-1.5 rounded-md border p-1.5 text-[11.5px] font-medium hover:border-line-strong", s.base === b && "border-foreground")}>
                    <span className="h-6 rounded-[4px] border" style={{ background: BASES[b].canvas, borderColor: BASES[b].border }}>
                      <span className="mt-1.5 ml-1.5 block h-1.5 w-1/2 rounded-full" style={{ background: BASES[b].ink }} />
                    </span>
                    {t(`controls.bases.${b}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="grid gap-1.5">
              <span className={label}>{t("controls.font")}</span>
              <select value={s.font} onChange={(e) => set("font", e.target.value)} className="h-9 rounded-md border bg-background px-2 text-[14px]">
                {FONTS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className={cn(label, "flex justify-between")}>{t("controls.radius")}<code className="font-mono">{s.radius} px</code></span>
              <input type="range" min={0} max={24} value={s.radius} onChange={(e) => set("radius", Number(e.target.value))} className="w-full" />
            </label>

            <fieldset>
              <legend className={cn(label, "mb-2")}>{t("controls.density")}</legend>
              <div className="grid grid-cols-2 rounded-md border p-0.5">
                {(["comfortable", "compact"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => set("density", d)} aria-pressed={s.density === d}
                    className={cn("h-8 rounded-[5px] text-[13px] font-medium text-muted-foreground", s.density === d && "bg-foreground text-background")}>
                    {t(`controls.${d}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : (
          <div className="look-term oz-scope relative min-h-[300px] flex-1 bg-background text-foreground">
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}
              className="absolute top-3 right-3 inline-flex items-center gap-1.5 font-mono text-[12px] text-foreground/60 hover:text-foreground">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? t("controls.copied") : t("controls.copy")}
            </button>
            <pre tabIndex={0} className="overflow-x-auto p-5 pt-10 font-mono text-[12px] leading-[1.65]"><code>{json}</code></pre>
          </div>
        )}
        </div>

        <p role="status" className={cn("mt-auto flex items-start gap-2 border-t px-5 py-3 text-[12.5px] leading-snug", warnings.length ? "text-warn" : "text-muted-foreground")}>
          <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", warnings.length ? "bg-warn" : "bg-success")} />
          {warnings.length ? t("controls.contrastWarn", { token: TOKENS[warnings[0]!.token] ? t(`controls.tokens.${TOKENS[warnings[0]!.token]!}`) : warnings[0]!.token, ratio: warnings[0]!.ratio.toFixed(1) }) : t("controls.contrastOk")}
        </p>
      </div>

      {/* the board */}
      <div className="order-1 min-w-0 bg-wash p-3 sm:p-5 lg:order-2">
        <div className="pg-board oz-scope overflow-hidden rounded-xl border bg-background font-sans text-foreground shadow-[0_20px_50px_-30px_rgb(13_12_20/0.35)] transition-colors">
          <MiniBoard name={name} compact={s.density === "compact"} />
        </div>
      </div>
    </div>
  );
}

/** The sample board. `view`/`onView` let a parent (the landing's product tour) drive the tabs. */
export function MiniBoard({ name, compact, view: shown, onView }: { name: string; compact: boolean; view?: View; onView?: (v: View) => void }) {
  const t = useTranslations("playground.board");
  const locale = useLocale();
  const sample = (): Idea[] => (t.raw("ideas") as IdeaText[]).map((i, id) => ({ ...i, ...IDEAS[id]!, id, voted: false, comments: [...i.comments] }));
  const news = t.raw("news") as News[];
  const bugs = (t.raw("bugs") as { title: string }[]).map((b, k) => ({ ...b, ...BUGS[k]! }));
  const [own, setOwn] = useState<View>("ideas");
  const view = shown ?? own;
  const setView = (v: View) => (onView ? onView(v) : setOwn(v));
  const [ideas, setIdeas] = useState<Idea[]>(sample);
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [comment, setComment] = useState("");

  // Language switched: reset the sample content.
  useEffect(() => { setIdeas(sample()); setOpen(null); }, [locale]);

  const vote = (id: number) => setIdeas((xs) => xs.map((i) => (i.id === id ? { ...i, voted: !i.voted, votes: i.votes + (i.voted ? -1 : 1) } : i)));
  const sorted = [...ideas].sort((a, b) => b.votes - a.votes);
  const current = ideas.find((i) => i.id === open);
  const row = compact ? "py-2.5" : "py-3.5";
  const r = { borderRadius: "var(--oz-radius)" };
  const btn = "inline-flex h-8 items-center gap-1.5 bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:opacity-90";

  const Vote = ({ i }: { i: Idea }) => (
    <button type="button" onClick={(e) => { e.stopPropagation(); vote(i.id); }} aria-pressed={i.voted} aria-label={`${i.votes} ${t("votes")}`} style={r}
      className={cn("grid h-11 w-10 shrink-0 place-items-center content-center border text-[13px] leading-none font-bold tabular-nums transition-colors",
        i.voted ? "border-primary bg-primary text-primary-foreground" : "border-line-strong hover:border-primary")}>
      <ChevronUp className="size-3.5" strokeWidth={2.5} />{i.votes}
    </button>
  );

  return (
    <div className="flex h-[520px] flex-col">
      <div className="flex h-12 shrink-0 items-center gap-5 border-b bg-surface px-4">
        <span className="flex min-w-0 shrink-0 items-center gap-2">
          <span className="grid size-6 place-items-center bg-primary text-[11px] font-bold text-primary-foreground" style={{ borderRadius: "calc(var(--oz-radius) * 0.6)" }}>{name.charAt(0).toUpperCase()}</span>
          <b className="max-w-[12ch] truncate font-heading text-[14.5px] font-semibold">{name}</b>
        </span>
        <nav className="flex min-w-0 gap-4 overflow-x-auto text-[13px] font-medium whitespace-nowrap text-muted-foreground [scrollbar-width:none]">
          {VIEWS.map((v) => (
            <button key={v} type="button" aria-current={view === v ? "page" : undefined} onClick={() => { setView(v); setOpen(null); }}
              className={cn("relative h-12 hover:text-foreground", view === v && "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary")}>
              {t(`tabs.${v}`)}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {view === "ideas" && !current && (
          <div className="grid gap-3">
            {adding ? (
              <form className="grid gap-2 border bg-surface p-3" style={r}
                onSubmit={(e) => { e.preventDefault(); if (!draft.trim()) return; setIdeas((xs) => [...xs, { id: Date.now(), title: draft.trim(), text: "", author: t("you"), votes: 1, voted: true, status: "open", comments: [], mine: true }]); setDraft(""); setAdding(false); }}>
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 80))} placeholder={t("titlePh")} aria-label={t("titlePh")} style={r}
                  className="h-9 border bg-background px-2.5 text-[14px] focus-visible:border-primary" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAdding(false)} className="h-8 px-3 text-[13px] text-muted-foreground hover:text-foreground">{t("cancel")}</button>
                  <button type="submit" className={btn} style={r}>{t("add")}</button>
                </div>
              </form>
            ) : (
              <button type="button" onClick={() => setAdding(true)} className={cn(btn, "justify-self-end")} style={r}><Plus className="size-3.5" />{t("suggest")}</button>
            )}
            <ul className="divide-y overflow-hidden border bg-surface" style={r}>
              {sorted.map((i) => (
                <li key={i.id} className={cn("grid cursor-pointer grid-cols-[auto_1fr] items-center gap-3 px-3.5 hover:bg-wash sm:grid-cols-[auto_1fr_auto]", row)} onClick={() => setOpen(i.id)}>
                  <Vote i={i} />
                  <span className="min-w-0">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(i.id); }} className="block max-w-full truncate text-left text-[14px] font-semibold hover:underline">{i.title}</button>
                    <small className="flex items-center gap-2 text-[12px] text-muted-foreground">
                      {i.mine ? t("now") : i.author}
                      {i.comments.length > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{i.comments.length}</span>}
                    </small>
                  </span>
                  <span className="hidden items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap sm:inline-flex"><StatusMark kind="idea" status={i.status} />{t(`status.${i.status}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view === "ideas" && current && (
          <article className="grid gap-4">
            <button type="button" onClick={() => setOpen(null)} className="inline-flex items-center gap-1.5 justify-self-start text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />{t("back")}</button>
            <div className="flex items-start gap-3">
              <Vote i={current} />
              <div className="min-w-0">
                <h4 className="font-heading text-[18px] leading-tight font-semibold">{current.title}</h4>
                <p className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"><StatusMark kind="idea" status={current.status} />{t(`status.${current.status}`)}</p>
              </div>
            </div>
            {current.text && <p className="text-[14px] leading-relaxed">{current.text}</p>}
            <div className="grid gap-2 border-t pt-4">
              <p className="text-[12.5px] font-medium text-muted-foreground">{t("comments", { n: current.comments.length })}</p>
              {current.comments.length === 0 && <p className="text-[13px] text-muted-foreground">{t("empty")}</p>}
              {current.comments.map(([who, text], k) => (
                <div key={k} className="border bg-surface p-3 text-[13.5px]" style={r}><b className="mr-1.5 font-semibold">{who}</b>{text}</div>
              ))}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!comment.trim()) return; setIdeas((xs) => xs.map((i) => (i.id === current.id ? { ...i, comments: [...i.comments, [t("you"), comment.trim()]] } : i))); setComment(""); }}>
                <input value={comment} onChange={(e) => setComment(e.target.value.slice(0, 200))} placeholder={t("comment")} aria-label={t("comment")} style={r}
                  className="h-9 min-w-0 flex-1 border bg-surface px-2.5 text-[13.5px] focus-visible:border-primary" />
                <button type="submit" className={btn} style={r}>{t("send")}</button>
              </form>
            </div>
          </article>
        )}

        {view === "roadmap" && (
          <div className="grid gap-3 sm:grid-cols-3">
            {(["planned", "in_progress", "shipped"] as const).map((col) => (
              <div key={col} className="grid content-start gap-2">
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold"><StatusMark kind="idea" status={col} />{t(`columns.${col}`)}</p>
                {(col === "shipped" ? news.map((n) => ({ id: -Number(n.v.replace(".", "")), title: n.title, votes: 0 })) : sorted.filter((i) => i.status === col)).map((i) => (
                  <button key={i.id} type="button" disabled={col === "shipped"} onClick={() => { setView("ideas"); setOpen(i.id); }}
                    className={cn("border bg-surface p-3 text-left text-[13px] font-medium enabled:hover:border-line-strong", row)} style={r}>
                    {i.title}{col !== "shipped" && <span className="mt-1 block text-[11.5px] font-normal text-muted-foreground">{i.votes} {t("votes")}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        {view === "news" && (
          <ol className="grid gap-3">
            {news.map((n) => (
              <li key={n.v} className="border bg-surface p-4" style={r}>
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground"><span className="bg-primary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary-foreground" style={{ borderRadius: "calc(var(--oz-radius) * 0.5)" }}>{n.v}</span>{n.date}</p>
                <h4 className="mt-2 font-heading text-[15px] font-semibold">{n.title}</h4>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{n.text}</p>
              </li>
            ))}
          </ol>
        )}

        {view === "bugs" && (
          <div className="grid gap-3">
            <p className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><Lock className="size-3.5" />{t("private")}</p>
            <ul className="divide-y overflow-hidden border bg-surface" style={r}>
              {bugs.map((b) => (
                <li key={b.n} className={cn("grid grid-cols-[auto_1fr] items-center gap-3 px-3.5 sm:grid-cols-[auto_1fr_auto]", row)}>
                  <span className="w-10 text-right font-mono text-[13px] font-semibold text-muted-foreground">#{b.n}</span>
                  <b className="min-w-0 truncate text-[14px] font-semibold">{b.title}</b>
                  <span className="hidden items-center gap-1.5 text-[12px] font-semibold whitespace-nowrap sm:inline-flex">
                    <StatusMark kind="bug" status={b.status} />{t(`status.${b.status}`)}{b.v && <span className="font-normal text-muted-foreground">{b.v}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
