"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkUpdate } from "@/lib/actions";
import { routeText, type Kind } from "@/lib/route";
import { stagesOf } from "@/lib/statuses";

/**
 * Bulk changes on a team list: every row's checkbox belongs to the form "bulk" (ItemRow selectable); this bar
 * appears at the bottom once something is ticked. Status (e-mails optional, off by default: bulk moves are
 * usually housekeeping) and/or assignee.
 */
export function BulkBar({ slug, kind, team }: { slug: string; kind: Kind; team: { id: string; label: string; former?: boolean }[] }) {
  const t = useTranslations("board.bulk");
  const tr = useTranslations("route");
  const [count, setCount] = useState(0);
  const [pending, start] = useTransition();
  useEffect(() => {
    const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox][form="bulk"]')];
    const sync = () => setCount(boxes().filter((b) => b.checked).length);
    document.addEventListener("change", sync);
    sync();
    return () => document.removeEventListener("change", sync);
  }, []);
  const clear = () => {
    document.querySelectorAll<HTMLInputElement>('input[type=checkbox][form="bulk"]').forEach((b) => { b.checked = false; });
    setCount(0);
  };
  const submit = (form: FormData) => start(async () => {
    const r = await bulkUpdate(slug, form);
    if (r.error) { toast.error(r.error); return; }
    toast.success(t("done", { n: r.changed ?? 0 }));
    clear();
  });
  const select = "h-9 min-w-0 rounded-md border bg-surface px-2 text-[14px]";
  return (
    <form id="bulk" action={submit} hidden={count === 0}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,.25)] backdrop-blur">
      <div className="oz-frame flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-[14px] font-semibold" role="status">{t("selected", { n: count })}</p>
        <label className="flex items-center gap-2 text-[13.5px]">{t("status")}
          <select name="status" aria-label={t("status")} className={select} defaultValue="">
            <option value="">{t("keep")}</option>
            {stagesOf(kind).map((s) => <option key={s} value={s}>{routeText(tr, "label", s)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13.5px]">{t("assignee")}
          <select name="assignee" aria-label={t("assignee")} className={select} defaultValue="">
            <option value="">{t("keep")}</option>
            <option value="none">{t("nobody")}</option>
            {team.filter((x) => !x.former).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="notify" className="size-4 accent-[var(--oz-accent)]" />{t("notify")}</label>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={clear}>{t("clear")}</Button>
          <Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? t("applying") : t("apply")}</Button>
        </div>
      </div>
    </form>
  );
}
