"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import { confirmFix } from "@/lib/actions";
import { StatusMark } from "./ozvi/route";

/**
 * Closing the loop with the reporter: does the fix work for them? "Still broken" asks (optionally) what still
 * doesn't work before sending it back; either answer is confirmed with a toast (the box itself disappears).
 */
export function ConfirmFix({ slug, itemId, version }: { slug: string; itemId: string; version: string | null }) {
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const t = useTranslations("forms.confirmFix");
  const answer = (works: boolean) => start(async () => {
    const r = await confirmFix(slug, itemId, works, works ? "" : note);
    if (r.error) { setError(r.error); return; }
    toast.success(works ? t("verified") : t("reopened"));
  });
  return (
    <section aria-label={t("label")} className="grid gap-4 rounded-xl border border-st-done/40 bg-st-done/8 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <StatusMark kind="bug" status="fixed" className="size-6" />
      <div>
        <p className="font-heading text-[16px] font-semibold">{version ? t("titleIn", { v: version }) : t("title")}</p>
        <p className="text-[14px] text-muted-foreground">{t("text")}</p>
      </div>
      {!asking && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => answer(true)}>{t("works")}</Button>
          <Button variant="outline" disabled={pending} onClick={() => setAsking(true)}>{t("broken")}</Button>
        </div>
      )}
      {asking && (
        <div className="grid gap-2 sm:col-span-3">
          <Label htmlFor={`still-${itemId}`} className="text-[14px] font-semibold">{t("whatLabel")}</Label>
          <Textarea id={`still-${itemId}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} rows={3}
            placeholder={t("whatPlaceholder")} className="bg-surface" autoFocus />
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} aria-busy={pending || undefined} onClick={() => answer(false)}>{t("sendBack")}</Button>
            <Button variant="ghost" disabled={pending} onClick={() => setAsking(false)}>{t("cancel")}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-[14px] font-medium text-destructive sm:col-span-3">{error}</p>}
    </section>
  );
}
