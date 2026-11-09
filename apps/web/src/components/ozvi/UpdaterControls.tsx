"use client";

import { ArrowUpCircle, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { checkUpdates, setUpdaterMode, startUpdate, type UpdaterState } from "@/lib/updater-actions";
import type { UpdaterMode } from "@/lib/updater";
import { cn } from "@/lib/utils";
import { Result } from "../settings";

const MODES: UpdaterMode[] = ["notify", "manual", "auto"];

export function UpdaterModeForm({ slug, mode, window, tz }: { slug: string; mode: UpdaterMode; window: string; tz: string }) {
  const t = useTranslations("forms.updater");
  const [state, action, pending] = useActionState<UpdaterState, FormData>((p, f) => setUpdaterMode(slug, p, f), {});
  const [picked, setPicked] = useState(mode);
  return (
    <form action={action} className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[14px] font-semibold">{t("modeLabel")}</legend>
        {MODES.map((m) => (
          <label key={m} className={cn("flex cursor-pointer gap-3 rounded-lg border bg-surface px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            picked === m && "border-brand-line bg-brand-soft/40")}>
            <input type="radio" name="mode" value={m} checked={picked === m} onChange={() => setPicked(m)} className="mt-1 accent-[var(--oz-accent)]" />
            <span className="grid gap-0.5">
              <span className="text-[14px] font-semibold">{t(`modes.${m}.label`)}</span>
              <span className="text-[13px] text-muted-foreground">{t(`modes.${m}.text`, { window, tz })}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending || picked === mode} aria-busy={pending || undefined}>{t("saveMode")}</Button>
        <Result error={state.error} ok={state.ok} />
      </div>
    </form>
  );
}

export function UpdateNowButton({ slug, version }: { slug: string; version: string }) {
  const t = useTranslations("forms.updater");
  const [state, action, pending] = useActionState<UpdaterState, FormData>((p) => startUpdate(slug, p), {});
  const [open, setOpen] = useState(false);
  useEffect(() => { if (state.ok || state.error) setOpen(false); }, [state]);
  return (
    <div className="grid gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" className="justify-self-start"><ArrowUpCircle />{t("updateNow", { v: version })}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle", { v: version })}</DialogTitle>
            <DialogDescription>{t("confirmText")}</DialogDescription>
          </DialogHeader>
          <form action={action}>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">{t("cancel")}</Button></DialogClose>
              <Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? t("updating") : t("updateNow", { v: version })}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Result error={state.error} ok={state.ok} />
    </div>
  );
}

export function CheckNowButton({ slug }: { slug: string }) {
  const t = useTranslations("forms.updater");
  const [state, action, pending] = useActionState<UpdaterState, FormData>((p) => checkUpdates(slug, p), {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-busy={pending || undefined}>
        <RefreshCw className={cn(pending && "animate-spin motion-reduce:animate-none")} />{t("checkNow")}
      </Button>
      <Result error={state.error} ok={state.ok} />
    </form>
  );
}

/** While an update runs the web container itself restarts; poll until the page answers again. */
export function RefreshWhileRunning({ running }: { running: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [running, router]);
  return null;
}
