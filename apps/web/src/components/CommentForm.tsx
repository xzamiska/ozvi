"use client";

import { Lock } from "lucide-react";
import { useActionState, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MarkdownEditor } from "./MarkdownEditor";
import { useTranslations } from "next-intl";
import { addComment, type FormState } from "@/lib/actions";
import { Avatar } from "./Avatar";
import { Honeypot } from "./Honeypot";

/** ⌘ on Apple devices, Ctrl elsewhere; server render assumes Ctrl. */
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const noop = () => () => {};

/** `internalOnly`: only team notes are possible here (a merged idea: its public discussion goes on at the original). */
export function CommentForm({ slug, itemId, isTeam, me, internalOnly = false }: { slug: string; itemId: string; isTeam: boolean; me: string | null; internalOnly?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const t = useTranslations("forms.comment");
  // "Team only" is the team's choice for the conversation, not for one comment: it stays on after sending
  // (resetting it to public after every note let the next internal note go out to the customer).
  const [internalChoice, setInternal] = useState(false);
  const internal = internalOnly || internalChoice;
  const mod = useSyncExternalStore(noop, () => (isApple() ? "⌘" : "Ctrl"), () => "Ctrl");
  const [state, action, pending] = useActionState(async (prev: FormState, form: FormData) => {
    const r = await addComment(slug, itemId, prev, form);
    if (!r.error) ref.current?.reset();
    return r;
  }, {});
  return (
    <form ref={ref} action={action} className="grid grid-cols-[32px_1fr] gap-3">
      <Honeypot />
      <input type="hidden" name="internal" value={internal ? "on" : ""} />
      <Avatar name={me} size={32} />
      <div className={`grid gap-2 rounded-xl border p-2 shadow-xs focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20 ${internal ? "border-dashed bg-wash" : "bg-surface"}`}>
        <label className="sr-only" htmlFor="comment">{t("label")}</label>
        <MarkdownEditor bare slug={slug} id="comment" name="body" rows={3} placeholder={t("placeholder")} required maxLength={5000}
          className="min-h-[76px] px-2 py-1.5"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ref.current?.requestSubmit(); }} />
        {state.error && <p className="px-2 text-[13px] font-medium text-destructive" role="alert">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-3 border-t px-1 pt-2">
          {isTeam && !internalOnly && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-medium text-muted-foreground">
              {/* Not tied to the form (form="" points nowhere): both React and Radix reset form controls after sending, and
                  this choice must survive that. The value goes through the hidden input. */}
              <Switch form="oz-no-form" checked={internal} onCheckedChange={setInternal} /> <Lock className="size-3.5" />{t("teamOnly")}
            </label>
          )}
          {internalOnly && <span className="inline-flex items-center gap-2 text-[13px] font-medium text-muted-foreground"><Lock className="size-3.5" />{t("teamOnly")}</span>}
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline"><kbd>{mod}</kbd> + <kbd>Enter</kbd></span>
          <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined} className="max-sm:ml-auto">{pending ? t("adding") : t("add")}</Button>
        </div>
      </div>
    </form>
  );
}
