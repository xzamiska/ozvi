"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { setKnownIssue, type FormState } from "@/lib/actions";

/**
 * Team: publish a bug as a known issue (ADR-0015 phase 3). Reporters see only the title and note typed here,
 * never the report. The title starts from the report's own title for the team to rewrite (it may name a
 * customer); nothing is public until the team submits.
 */
export function KnownIssueBox({ slug, itemId, published, title, body, joined }: {
  slug: string; itemId: string; published: boolean; title: string; body: string; joined: number;
}) {
  const t = useTranslations("forms.known");
  const [open, setOpen] = useState(published);
  const [state, action, pending] = useActionState((p: FormState & { saved?: number }, f: FormData) => setKnownIssue(slug, itemId, p, f), {});
  useEffect(() => { if (state.saved) toast.success(t("saved")); }, [state.saved, t]);

  if (!open) {
    return (
      <div className="grid gap-1.5">
        <p className="text-[13px] text-muted-foreground">{t("hint")}</p>
        <div><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>{t("start")}</Button></div>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-2.5">
      {published
        ? <p className="text-[13px] text-muted-foreground">{t("published", { n: joined })}</p>
        : <p className="text-[13px] text-muted-foreground">{t("privacy")}</p>}
      <label className="grid gap-1 text-[13px] font-medium">{t("title")}
        <Input name="title" defaultValue={title} required minLength={3} maxLength={200} className="h-9 bg-surface" />
      </label>
      <label className="grid gap-1 text-[13px] font-medium">{t("body")}
        <Textarea name="body" defaultValue={body} maxLength={2000} rows={3} className="bg-surface" placeholder={t("bodyPlaceholder")} />
      </label>
      {state.error && <p className="text-[13px] font-medium text-destructive" role="alert">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>{published ? t("save") : t("publish")}</Button>
        {published
          ? <Button type="submit" name="hide" value="1" variant="outline" size="sm" formNoValidate disabled={pending}>{t("hide")}</Button>
          : <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>{t("cancel")}</Button>}
      </div>
    </form>
  );
}
