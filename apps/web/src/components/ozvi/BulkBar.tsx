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
export function BulkBar({ slug, kind, team, me }: { slug: string; kind: Kind; team: { id: string; label: string; former?: boolean }[]; me?: string }) {
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
    // Setting `checked` fires no event: tell the "select all" box (ListTools) the rows are clear now.
    document.dispatchEvent(new Event("change"));
  };
  const submit = (form: FormData) => start(async () => {
    const r = await bulkUpdate(slug, form);
    if (r.error) { toast.error(r.error); return; }
    toast.success(t("done", { n: r.changed ?? 0 }));
    clear();
  });
  const select = "h-9 w-full min-w-0 rounded-md border bg-surface px-2 text-[14px] sm:w-auto";
  // Phones: count and buttons on one line, the two choices side by side with their labels above (the
  // wrapped desktop row took four lines and covered a third of the list).
  const field = "grid min-w-0 gap-1 text-[12.5px] text-muted-foreground sm:flex sm:items-center sm:gap-2 sm:text-[13.5px] sm:text-foreground";
  return (
    <>
      <form id="bulk" action={submit} hidden={count === 0}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-surface px-4 py-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(0,0,0,.25)] sm:py-3">
        <div className="oz-frame grid grid-cols-2 items-end gap-x-3 gap-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
          <p className="self-center text-[14px] font-semibold" role="status">{t("selected", { n: count })}</p>
          <div className="flex justify-end gap-2 sm:order-last sm:ml-auto">
            <Button type="button" variant="ghost" onClick={clear}>{t("clear")}</Button>
            <Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? t("applying") : t("apply")}</Button>
          </div>
          <label className={field}>{t("status")}
            <select name="status" aria-label={t("status")} className={select} defaultValue="">
              <option value="">{t("keep")}</option>
              {stagesOf(kind).map((s) => <option key={s} value={s}>{routeText(tr, "label", s)}</option>)}
            </select>
          </label>
          <label className={field}>{t("assignee")}
            <select name="assignee" aria-label={t("assignee")} className={select} defaultValue="">
              <option value="">{t("keep")}</option>
              <option value="none">{t("nobody")}</option>
              {team.filter((x) => !x.former).map((x) => <option key={x.id} value={x.id}>{x.id === me ? t("you", { who: x.label }) : x.label}</option>)}
            </select>
          </label>
          <label className="col-span-2 flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="notify" className="size-4 accent-[var(--oz-accent)]" />{t("notify")}</label>
        </div>
      </form>
      {/* Room under the list so the bar never covers the last rows' checkboxes. */}
      <div aria-hidden hidden={count === 0} className="h-40 sm:h-20" />
    </>
  );
}
