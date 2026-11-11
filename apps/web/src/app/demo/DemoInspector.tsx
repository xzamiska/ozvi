"use client";

import { Bug, Check, ChevronUp, Lightbulb, Lock, Mail, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DemoBoard, type BoardSample } from "./DemoBoard";

/**
 * The demo's "server": what the widget "sent" (mock.ts) lives only in this component's state.
 * The side panel shows the last report; the board (an overlay, opened from the panel or from the
 * widget's "view report") is a one-off board with exactly these reports, as the team and as the
 * author see it. Nothing is stored anywhere; closing the tab forgets it.
 */
export interface Sent {
  kind: string; number: number; title: string; body: string;
  context: {
    url?: string; browser?: string; viewport?: string; appVersion?: string;
    errors?: { text: string }[]; network?: { method: string; url: string; status: number; failed: boolean }[];
    actions?: { kind: string; label: string }[];
  };
  files: { name: string; url: string }[];
}
export function DemoInspector({ sample }: { sample: BoardSample }) {
  const t = useTranslations("demo");
  const [all, setAll] = useState<Sent[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const sent = (e: Event) => setAll((xs) => [(e as CustomEvent<Sent>).detail, ...xs]);
    const show = (e: Event) => {
      setOpen((e as CustomEvent<{ path: string }>).detail.path);
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
            <button type="button" onClick={() => { setOpen(`/i/${last.number}`); (window as unknown as { Ozvi?: { close?: () => void } }).Ozvi?.close?.(); }} className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg bg-foreground px-4 text-[14px] font-semibold text-background hover:opacity-85">
              {t("board.open")}
            </button>
          </div>
        )}
      </aside>
      {open !== null && <DemoBoard reports={all} sample={sample} path={open} onClose={() => setOpen(null)} />}
    </>
  );
}
