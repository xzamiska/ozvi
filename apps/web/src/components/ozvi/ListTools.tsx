"use client";

import { Rows3, Rows4 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { DENSE_KEY } from "@/lib/storage-keys";


const KEY = DENSE_KEY;
const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox][form="bulk"]')];

/**
 * Above a team list: "Select all" for the rows on this page (the bulk bar then acts on them) and dense rows
 * (title and meta only: more reports on one screen while triaging). Density is a per-browser preference.
 */
export function ListTools({ count }: { count: number }) {
  const t = useTranslations("board.bulk");
  const all = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"none" | "some" | "all">("none");
  const [dense, setDense] = useState(false);

  useEffect(() => {
    const sync = () => {
      const b = boxes(), n = b.filter((x) => x.checked).length;
      setState(n === 0 ? "none" : n === b.length ? "all" : "some");
    };
    document.addEventListener("change", sync);
    sync();
    try { setDense(localStorage.getItem(KEY) === "1"); } catch { /* private mode */ }
    return () => document.removeEventListener("change", sync);
  }, []);
  useEffect(() => { if (all.current) all.current.indeterminate = state === "some"; }, [state]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-dense", dense);
    return () => document.documentElement.removeAttribute("data-dense");
  }, [dense]);

  const selectAll = (on: boolean) => {
    for (const b of boxes()) b.checked = on;
    // The bulk bar and this box listen to "change" on the document.
    document.dispatchEvent(new Event("change"));
  };
  const toggleDense = () => setDense((d) => {
    try { localStorage.setItem(KEY, d ? "0" : "1"); } catch { /* private mode */ }
    return !d;
  });

  return (
    <div className="mb-2 flex items-center justify-between gap-3 px-4 text-[13.5px] sm:px-5">
      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2.5 font-medium">
        <input ref={all} type="checkbox" checked={state === "all"} onChange={(e) => selectAll(e.target.checked)}
          className="size-4 cursor-pointer accent-[var(--oz-accent)]" />
        {t("selectAll", { n: count })}
      </label>
      <button type="button" aria-pressed={dense} onClick={toggleDense}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:text-foreground">
        {dense ? <Rows4 aria-hidden className="size-4" /> : <Rows3 aria-hidden className="size-4" />}{t("dense")}
      </button>
    </div>
  );
}
