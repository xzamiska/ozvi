"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface DevTab { id: string; label: string; file: string; note: string; code: string }

/** Tabbed code panel for the landing. Plain text code, no highlighter: tokens are coloured by a tiny pass. */
export function DevTabs({ tabs }: { tabs: DevTab[] }) {
  const t = useTranslations("landing");
  const label = t("dev.tablist"), copyLabel = t("dev.copy"), copiedLabel = t("dev.copied");
  const [current, setCurrent] = useState(tabs[0]!.id);
  const [copied, setCopied] = useState(false);
  const tab = tabs.find((t) => t.id === current)!;

  const copy = async () => {
    try { await navigator.clipboard.writeText(tab.code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-surface">
      <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b [scrollbar-width:none]">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={t.id === current} aria-controls="dev-panel"
            onClick={() => { setCurrent(t.id); setCopied(false); }}
            className={cn("relative h-11 shrink-0 px-4 text-[13.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
              t.id === current && "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-primary")}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="dev-panel" role="tabpanel" aria-labelledby={`tab-${tab.id}`}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <span className="truncate font-mono text-[12px] text-muted-foreground">{tab.file}</span>
          <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[12px] text-muted-foreground hover:text-foreground">
            {copied ? <><Check className="size-3.5" />{copiedLabel}</> : <><Copy className="size-3.5" />{copyLabel}</>}
          </button>
        </div>
        <pre tabIndex={0} className="overflow-x-auto p-4 font-mono text-[12px] leading-[1.7] whitespace-pre-wrap [overflow-wrap:anywhere] sm:min-h-[248px] sm:p-5 sm:text-[13px] sm:whitespace-pre"><code>{paint(tab.code)}</code></pre>
        <p className="border-t px-4 py-3 text-[13.5px] text-muted-foreground sm:px-5">{tab.note}</p>
      </div>
    </div>
  );
}

/** Minimal colouring: comments, strings, and keywords. Enough to read as code, no dependency. */
function paint(code: string): React.ReactNode[] {
  const re = /(\/\/[^\n]*|^#[^\n]*|"[^"\n]*"|`[^`\n]*`|\b(?:import|from|export|async|function|const|await|return)\b)/gm;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    if (m.index! > last) out.push(code.slice(last, m.index));
    const s = m[0];
    const cls = s.startsWith("//") || s.startsWith("#") ? "text-muted-foreground italic" : /^["`]/.test(s) ? "text-success" : "text-primary";
    out.push(<span key={m.index} className={cls}>{s}</span>);
    last = m.index! + s.length;
  }
  out.push(code.slice(last));
  return out;
}
