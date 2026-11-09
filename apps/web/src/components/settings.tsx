"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { codeBox, hint } from "./settings-base";

export { codeBox, hint, noFill, panel, preBox } from "./settings-base";

/** Shared building blocks for settings screens (admin, tokens, my data). */

export function Field({ id, label, optional, hint: h, children, className }: {
  id?: string; label: React.ReactNode; optional?: boolean; hint?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  const t = useTranslations("admin.settings");
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id} className="text-[14px] font-semibold">
        {label}{optional && <span className="font-normal text-muted-foreground">{t("optional")}</span>}
      </Label>
      {children}
      {h && <p className={hint} id={id ? `${id}-hint` : undefined}>{h}</p>}
    </div>
  );
}

/** Result of a server action: error or success, announced to screen readers. */
export function Result({ error, ok, className }: { error?: string; ok?: string; className?: string }) {
  if (error) return <p role="alert" className={cn("text-[14px] font-medium text-destructive", className)}>{error}</p>;
  if (ok) return <p role="status" className={cn("text-[14px] font-medium text-success", className)}>{ok}</p>;
  return null;
}

export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const t = useTranslations("admin.settings");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 2000);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <Button type="button" variant="outline" size="sm" className={className}
      onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true), () => {})}>
      {done ? <Check /> : <Copy />}
      <span aria-live="polite">{done ? t("copied") : (label ?? t("copy"))}</span>
    </Button>
  );
}

/** A one-time secret: highlighted, selectable, copyable. */
export function SecretBox({ title, secret, children }: { title: React.ReactNode; secret: string; children?: React.ReactNode }) {
  const t = useTranslations("admin.settings");
  return (
    <div role="status" className="grid gap-3 rounded-lg border border-brand-line bg-brand-soft p-4">
      <p className="text-[14px] font-semibold">{title} {t("secretOnce")}</p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <code className={cn(codeBox, "bg-surface")}>{secret}</code>
        <CopyButton text={secret} />
      </div>
      {children && <div className={hint}>{children}</div>}
    </div>
  );
}

/** A button that asks in a dialog before running a server action. */
export function ConfirmAction({ run, trigger, title, text, confirm, pending: pendingLabel, size = "sm", variant = "outline", destructive = true }: {
  run: () => Promise<unknown>; trigger: React.ReactNode; title: string; text: React.ReactNode; confirm: string; pending?: string;
  size?: "sm" | "default"; variant?: "outline" | "ghost"; destructive?: boolean;
}) {
  const t = useTranslations("admin.settings");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant={variant} size={size}>{trigger}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">{t("keep")}</Button></DialogClose>
          <Button type="button" variant={destructive ? "destructive" : "default"} disabled={pending} aria-busy={pending || undefined}
            onClick={() => start(async () => { await run(); setOpen(false); })}>
            {pending ? (pendingLabel ?? t("working")) : confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A radio option with a bold name and a one-line explanation (works with a RadioGroup). */
export function ChoiceLabel({ htmlFor, title, text }: { htmlFor: string; title: string; text: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="block cursor-pointer text-[14px] leading-snug font-normal">
      <span className="font-semibold">{title}</span> <span className="text-muted-foreground">— {text}</span>
    </Label>
  );
}

/** Where the reading area starts: below the sticky header (sections use scroll-mt-24 = 96px), plus a little slack. */
const SPY_LINE = 112;

/**
 * Left-hand section nav for long settings pages; highlights the section at the top of the reading area.
 * The active section is the last one whose top has passed the line under the header (so a tall section
 * stays active until the next one reaches the top, whatever their heights); at the bottom of the page the
 * last section wins. A click activates its item at once and holds it until that scroll settles.
 */
export function SectionNav({ items }: { items: { id: string; label: string; sub?: string }[] }) {
  const t = useTranslations("admin.settings");
  const [active, setActive] = useState(items[0]?.id);
  const ids = items.map((i) => i.id).join(" ");
  const held = useRef<{ id: string; timer: number } | null>(null);
  useEffect(() => {
    const list = ids.split(" ").filter(Boolean);
    let frame = 0;
    const compute = () => {
      frame = 0;
      if (held.current) return;
      const els = list.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
      if (els.length === 0) return;
      const doc = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) { setActive(els[els.length - 1]!.id); return; }
      let current = els[0]!;
      for (const el of els) if (el.getBoundingClientRect().top - SPY_LINE <= 0) current = el;
      setActive(current.id);
    };
    const onScroll = () => {
      // A click is holding its item: keep it until the smooth scroll stops (no scroll event for 150 ms).
      if (held.current) {
        window.clearTimeout(held.current.timer);
        held.current.timer = window.setTimeout(() => { held.current = null; }, 150);
        return;
      }
      if (!frame) frame = requestAnimationFrame(compute);
    };
    // Landing on #section: show that section, otherwise whatever is at the top.
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash && list.includes(hash)) setActive(hash); else compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (held.current) window.clearTimeout(held.current.timer);
    };
  }, [ids]);
  const pick = (id: string) => {
    setActive(id);
    if (held.current) window.clearTimeout(held.current.timer);
    // Released by the scroll it causes; if the page can't scroll there (already in place), release soon anyway.
    held.current = { id, timer: window.setTimeout(() => { held.current = null; }, 600) };
  };
  return (
    <nav aria-label={t("sections")} className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
      <ul className="grid gap-0.5 border-l">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} aria-current={active === i.id ? "location" : undefined} onClick={() => pick(i.id)}
              className={cn(
                "-ml-px block border-l-2 border-transparent py-1.5 pl-3.5 text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                active === i.id && "border-brand text-foreground",
              )}>
              {i.label}
              {i.sub && <span className="block text-[12.5px] font-normal text-muted-foreground">{i.sub}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
