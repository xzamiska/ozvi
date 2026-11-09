"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { confirmFix } from "@/lib/actions";
import { StatusMark } from "./ozvi/route";

/** Closing the loop with the reporter: does the fix work for them? */
export function ConfirmFix({ slug, itemId, version }: { slug: string; itemId: string; version: string | null }) {
  const [pending, start] = useTransition();
  const t = useTranslations("forms.confirmFix");
  return (
    <section aria-label={t("label")} className="grid gap-4 rounded-xl border border-st-done/40 bg-st-done/8 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <StatusMark kind="bug" status="fixed" className="size-6" />
      <div>
        <p className="font-heading text-[16px] font-semibold">{version ? t("titleIn", { v: version }) : t("title")}</p>
        <p className="text-[14px] text-muted-foreground">{t("text")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start(() => confirmFix(slug, itemId, true))}>{t("works")}</Button>
        <Button variant="outline" disabled={pending} onClick={() => start(() => confirmFix(slug, itemId, false))}>{t("broken")}</Button>
      </div>
    </section>
  );
}
