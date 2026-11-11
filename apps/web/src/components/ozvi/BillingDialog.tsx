"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { BillingResult } from "@/lib/app-actions";
import { cn } from "@/lib/utils";

/**
 * Every subscription change is confirmed first: what changes, what it costs now and from when.
 * The confirm button shows progress and cannot be pressed twice; a gateway error stays in the dialog.
 */
export function BillingDialog({ trigger, title, lines, confirm, pending, keep, action, tone = "default", triggerVariant = "outline", className }: {
  trigger: React.ReactNode; title: string; lines: React.ReactNode[]; confirm: string; pending: string; keep: string;
  action: () => Promise<BillingResult | void>; tone?: "default" | "destructive"; triggerVariant?: "outline" | "default" | "ghost"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); setError(null); } }}>
      <DialogTrigger asChild><Button type="button" variant={triggerVariant} className={className}>{trigger}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-[14px] leading-relaxed">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13.5px] text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>{keep}</Button></DialogClose>
          <Button type="button" variant={tone === "destructive" ? "destructive" : "default"} disabled={busy} aria-busy={busy || undefined}
            onClick={() => start(async () => {
              setError(null);
              // On success the action redirects (the page shows the new state); only errors come back.
              const r = await action();
              if (r?.error) setError(r.error);
            })}>
            {busy ? <><Loader2 className="animate-spin" aria-hidden />{pending}</> : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A form submit that shows progress and blocks a second click (e.g. going to the checkout). */
export function PendingSubmit({ children, pending, className, variant = "default", disabled }: {
  children: React.ReactNode; pending: string; className?: string; variant?: "default" | "outline"; disabled?: boolean;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={cn(className)} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? <><Loader2 className="animate-spin" aria-hidden />{pending}</> : children}
    </Button>
  );
}
