"use client";

import { Bug, Check, Lightbulb, Lock, Mail, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { StatusMark } from "@/components/ozvi/route";
import { routeText } from "@/lib/route";
import { cn } from "@/lib/utils";

/**
 * The demo's "server": what the widget "sent" (mock.ts) lives only in this component's state.
 * The side panel shows the last report; the board (an overlay, opened from the panel or from the
 * widget's "view report") is a one-off board with exactly these reports, as the team and as the
 * author see it. Nothing is stored anywhere; closing the tab forgets it.
 */
interface Sent {
  kind: string; number: number; title: string; body: string;
  context: {
    url?: string; browser?: string; viewport?: string; appVersion?: string;
    errors?: { text: string }[]; network?: { method: string; url: string; status: number; failed: boolean }[];
    actions?: { kind: string; label: string }[];
  };
  files: { name: string; url: string }[];
}
type Status = "new" | "confirmed" | "in_progress" | "fixed" | "verified";
const STOPS: Status[] = ["new", "confirmed", "in_progress", "fixed", "verified"];

export function DemoInspector() {
  const t = useTranslations("demo");
  const [all, setAll] = useState<Sent[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    const sent = (e: Event) => setAll((xs) => [(e as CustomEvent<Sent>).detail, ...xs]);
    const show = (e: Event) => {
      const m = /\/i\/(\d+)/.exec((e as CustomEvent<{ path: string }>).detail.path);
      setOpen(m ? Number(m[1]) : -1);
      (window as unknown as { Ozvi?: { close?: () => void } }).Ozvi?.close?.(); // the widget panel would sit on top
    };
    window.addEventListener("ozvi-demo", sent);
    window.addEventListener("ozvi-demo-open", show);
    return () => { window.removeEventListener("ozvi-demo", sent); window.removeEventListener("ozvi-demo-open", show); };
  }, []);
  const last = all[0];
  const failed = last?.context.network?.filter((r) => r.failed) ?? [];
  const row = "grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-t py-2.5 text-[13.5px]";

  return (
    <>
      <aside aria-live="polite" className="rounded-2xl border bg-surface p-5 shadow-[0_30px_80px_-40px_rgb(13_12_20/0.35)]">
        <h2 className="text-[17px] font-semibold tracking-tight">{t("inspector.title")}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{t("inspector.note")}</p>
        {!last ? (
          <p className="mt-5 rounded-xl border border-dashed p-4 text-[14px] leading-relaxed text-muted-foreground">{t("inspector.empty")}</p>
        ) : (
          <div className="mt-4">
            <p className="flex items-baseline gap-2">
              <span data-num className="text-[20px] font-extrabold tracking-tight">#{last.number}</span>
              <span className="text-[15px] font-semibold">{last.title || t("inspector.untitled")}</span>
            </p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{last.kind === "idea" ? t("inspector.idea") : t("inspector.bug")}</p>
            {last.files.map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f.url} src={f.url} alt={t("inspector.shot")} className="mt-4 w-full rounded-lg border" />
            ))}
            {last.kind !== "idea" && (
              <dl className="mt-4">
                <div className={row}><dt className="text-muted-foreground">{t("inspector.errors")}</dt><dd className="grid gap-1 font-mono text-[12px]">{last.context.errors?.length ? last.context.errors.map((e, i) => <span key={i} className="text-destructive">{e.text}</span>) : <span className="text-muted-foreground">–</span>}</dd></div>
                <div className={row}><dt className="text-muted-foreground">{t("inspector.network")}</dt><dd className="grid gap-1 font-mono text-[12px]">{failed.length ? failed.map((r, i) => <span key={i} className="truncate"><b className="text-destructive">{r.status || "—"}</b> {r.method} {r.url}</span>) : <span className="text-muted-foreground">{t("inspector.noFailed")}</span>}</dd></div>
              </dl>
            )}
            <button type="button" onClick={() => { setOpen(last.number); (window as unknown as { Ozvi?: { close?: () => void } }).Ozvi?.close?.(); }} className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-foreground px-4 text-[14px] font-semibold text-background hover:opacity-85">
              {t("board.open")}
            </button>
          </div>
        )}
      </aside>
      {open !== null && all.length > 0 && <DemoBoard reports={all} first={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function DemoBoard({ reports, first, onClose }: { reports: Sent[]; first: number; onClose: () => void }) {
  const t = useTranslations("demo");
  const tl = useTranslations("landing");
  const tt = (k: string, v?: Record<string, string>) => tl(`product.team.${k}` as never, v as never);
  const tr = useTranslations("route");
  const [sel, setSel] = useState(reports.some((r) => r.number === first) ? first : reports[0]!.number);
  const [view, setView] = useState<"team" | "author">("team");
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [told, setTold] = useState<Record<number, string>>({});
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);
  const cur = reports.find((r) => r.number === sel) ?? reports[0]!;
  const st = status[cur.number] ?? "new";
  const label = (s: Status) => routeText(tr, "label", s);
  const r = { borderRadius: "var(--oz-radius)" };
  const chip = "inline-flex items-center gap-1 rounded bg-wash px-1.5 py-0.5 text-[11.5px] text-muted-foreground";
  const failed = cur.context.network?.filter((x) => x.failed) ?? [];

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="demo-board-h" className="fixed inset-0 z-[2147483000] grid bg-ink/40 p-2 backdrop-blur-sm sm:p-6">
      <div ref={box} tabIndex={-1} className="mx-auto flex h-full w-full max-w-[1200px] flex-col overflow-hidden rounded-2xl border bg-surface shadow-2xl outline-none">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <h2 id="demo-board-h" className="text-[14.5px] font-semibold">{t("board.title")}</h2>
          <span className="text-[13px] text-muted-foreground">{t("board.note")}</span>
          <span role="group" aria-label={t("board.title")} className="ml-auto flex rounded-lg border bg-background p-0.5 text-[12.5px] font-medium">
            {(["team", "author"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={cn("h-7 rounded-md px-2.5", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{t(`board.${v}`)}</button>
            ))}
          </span>
          <button type="button" onClick={onClose} aria-label={t("board.close")} className="grid size-8 place-items-center rounded-md hover:bg-wash"><X className="size-4" /></button>
        </div>

        {/* the board, in the host app's brand */}
        <div className="look-host oz-scope flex min-h-0 flex-1 flex-col bg-background font-sans text-foreground">
          <div className="flex h-12 shrink-0 items-center gap-5 border-b bg-surface px-4 text-[13px]">
            <span className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded bg-primary text-[11px] font-bold text-primary-foreground">R</span><b className="text-[14.5px] font-semibold">{t("app.brand")}</b></span>
            {(t.raw("board.tabs") as string[]).map((x, i) => (
              <span key={x} className={cn("relative flex h-12 items-center text-muted-foreground", i === 3 && "font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary")}>{x}</span>
            ))}
          </div>

          {view === "team" ? (
            <div className="grid min-h-0 flex-1 md:grid-cols-[240px_minmax(0,1fr)]">
              <ul className="hidden divide-y overflow-y-auto border-r bg-surface md:block">
                {reports.map((x) => (
                  <li key={x.number}>
                    <button type="button" onClick={() => setSel(x.number)} aria-current={x.number === cur.number ? "true" : undefined}
                      className={cn("grid w-full gap-1 px-3.5 py-3 text-left hover:bg-wash", x.number === cur.number && "bg-wash shadow-[inset_2px_0_0_var(--oz-accent)]")}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[13px] font-extrabold tabular-nums">{x.kind === "idea" ? <Lightbulb className="size-3.5" /> : <Bug className="size-3.5" />}#{x.number}</span>
                        <StatusMark kind="bug" status={status[x.number] ?? "new"} className="size-3.5" />
                      </span>
                      <span className="line-clamp-2 text-[12.5px] leading-snug font-medium">{x.title || t("inspector.untitled")}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="min-w-0 overflow-y-auto p-5">
                <p className="flex items-baseline gap-2">
                  <span data-num className="text-[22px] leading-none font-extrabold tracking-tight">#{cur.number}</span>
                  <span className="text-[17px] font-semibold">{cur.title || t("inspector.untitled")}</span>
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">{t("board.you")} · <Lock className="inline size-3" /> {tt("private")}</p>
                {cur.body && <p className="mt-3 max-w-[70ch] text-[14.5px] leading-relaxed whitespace-pre-wrap">{cur.body}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={cn(chip, "font-mono")}>v{cur.context.appVersion || "?"}</span>
                  <span className={chip}>{cur.context.viewport}</span>
                  <span className={cn(chip, "max-w-full truncate")}>{cur.context.browser}</span>
                </div>
                {cur.files.map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.url} src={f.url} alt={t("inspector.shot")} className="mt-4 w-full max-w-[720px] rounded-lg border" />
                ))}
                {cur.kind !== "idea" && (
                  <div className="mt-5 grid max-w-[720px] gap-4">
                    <Block title={t("inspector.errors")}>{cur.context.errors?.length ? cur.context.errors.map((e, i) => <p key={i} className="font-mono text-[12px] text-destructive">{e.text}</p>) : <p className="text-[13px] text-muted-foreground">–</p>}</Block>
                    <Block title={t("inspector.network")}>{failed.length ? failed.map((x, i) => <p key={i} className="truncate font-mono text-[12px]"><b className="text-destructive">{x.status || "—"}</b> {x.method} {x.url}</p>) : <p className="text-[13px] text-muted-foreground">{t("inspector.noFailed")}</p>}</Block>
                    <Block title={t("inspector.actions")}>{cur.context.actions?.length ? <ol className="grid gap-1 text-[13px]">{cur.context.actions.map((a, i) => <li key={i}><span className="text-muted-foreground">{i + 1}.</span> {a.label}</li>)}</ol> : <p className="text-[13px] text-muted-foreground">–</p>}</Block>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
                  <label className="inline-flex h-9 items-center gap-1.5 border border-input bg-surface pr-2 pl-2.5 text-[13px] font-semibold" style={r}>
                    <StatusMark kind="bug" status={st} />
                    <span className="sr-only">{tt("statusLabel")}</span>
                    <select value={st} onChange={(e) => setStatus((x) => ({ ...x, [cur.number]: e.target.value as Status }))} className="cursor-pointer appearance-none bg-transparent pr-1 outline-none">
                      {STOPS.map((s) => <option key={s} value={s}>{label(s)}{s === "fixed" ? " · 2.15" : ""}</option>)}
                    </select>
                  </label>
                  <button type="button" style={r} onClick={() => setTold((x) => ({ ...x, [cur.number]: st === "fixed" ? tt("sentFixed") : tt("sentStatus", { status: label(st) }) }))}
                    className="inline-flex h-9 items-center bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90">{tt("save")}</button>
                </div>
                {told[cur.number] && <p role="status" className="mt-2.5 flex items-start gap-1.5 text-[13px] text-success"><Mail className="mt-0.5 size-3.5 shrink-0" />{told[cur.number]} <button type="button" onClick={() => setView("author")} className="font-semibold underline">{t("board.seeAuthor")}</button></p>}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mx-auto max-w-[680px]">
                <p className="text-[13px] text-muted-foreground">{t("board.authorNote")}</p>
                <div className="mt-4 rounded-xl border bg-surface p-5">
                  <p className="flex items-baseline gap-2"><span data-num className="text-[22px] font-extrabold">#{cur.number}</span><span className="text-[17px] font-semibold">{cur.title || t("inspector.untitled")}</span></p>
                  <p className="mt-1 text-[12.5px] text-muted-foreground"><Lock className="inline size-3" /> {tt("private")}</p>
                  <ol className="mt-5 grid gap-3">
                    {STOPS.map((s, i) => {
                      const reached = i <= STOPS.indexOf(st);
                      return (
                        <li key={s} className={cn("flex items-center gap-3 text-[14px]", !reached && "text-muted-foreground")}>
                          <StatusMark kind="bug" status={reached ? s : "new"} className={cn("size-[18px]", !reached && "opacity-40")} />
                          <span className={cn(s === st && "font-semibold")}>{label(s)}{s === "fixed" ? " · 2.15" : ""}</span>
                          {s === st && <span className="ml-auto text-[12px] text-muted-foreground">{t("board.now")}</span>}
                        </li>
                      );
                    })}
                  </ol>
                  {told[cur.number]
                    ? <p className="mt-5 flex items-start gap-2 rounded-lg border bg-wash p-3 text-[13.5px]"><Check className="mt-0.5 size-4 shrink-0 text-success" />{told[cur.number]}</p>
                    : <p className="mt-5 text-[13px] text-muted-foreground">{t("board.noReply")}</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1.5 rounded-lg border bg-surface p-3">
      <h3 className="text-[12px] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
