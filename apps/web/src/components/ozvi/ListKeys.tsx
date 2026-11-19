"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Keyboard on list pages (triage review: "?", "j", "k", "/" did nothing). j / k move between rows (focus lands
 * on the row's title link, so Enter opens it), x ticks the row for bulk changes, / jumps to search, ? lists
 * them. Never while typing, never with Ctrl/⌘/Alt, so the browser's and screen readers' own keys stay intact.
 */
export function ListKeys() {
  const t = useTranslations("board.keys");
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLElement>("main li[data-row]")];
    const current = () => rows().findIndex((r) => r.contains(document.activeElement));
    const go = (i: number) => {
      const list = rows();
      const row = list[Math.max(0, Math.min(list.length - 1, i))];
      row?.querySelector<HTMLAnchorElement>("h2 a")?.focus();
      row?.scrollIntoView({ block: "nearest" });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("[role=dialog][data-state=open]")) return;
      const i = current();
      if (e.key === "j") { e.preventDefault(); go(i + 1); }
      else if (e.key === "k") { e.preventDefault(); go(i < 0 ? 0 : i - 1); }
      else if (e.key === "x" && i >= 0) {
        const box = rows()[i]!.querySelector<HTMLInputElement>('input[type=checkbox][form="bulk"]');
        if (box) { e.preventDefault(); box.click(); }
      } else if (e.key === "/") {
        const q = document.querySelector<HTMLInputElement>('main input[name="q"]');
        if (q) { e.preventDefault(); q.focus(); q.select(); }
      } else if (e.key === "?") { e.preventDefault(); setHelp(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const keys: [string, string][] = [["j", t("next")], ["k", t("prev")], ["Enter", t("open")], ["x", t("select")], ["/", t("search")], ["?", t("help")]];
  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("lede")}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[14px]">
          {keys.map(([k, v]) => (
            <div key={k} className="contents">
              <dt><kbd className="rounded border bg-wash px-1.5 py-0.5 font-mono text-[12.5px]">{k}</kbd></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
