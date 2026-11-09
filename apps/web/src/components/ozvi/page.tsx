import Link from "next/link";
import { cn } from "@/lib/utils";

/** Shared page anatomy for board and /app screens. */

/** The page frame. `measure` narrows the content but keeps it on the frame's left edge, under the header. */
export function Page({ children, className, measure }: { children: React.ReactNode; className?: string; measure?: string }) {
  return (
    <main id="main" tabIndex={-1} className={cn("oz-frame pt-8 pb-16 md:pt-10", className)}>
      {measure ? <div className={measure}>{children}</div> : children}
    </main>
  );
}

/**
 * Title (+ optional count and lede) with actions. Actions sit on the title's first line on every
 * page, whatever the lede length; the back link sits above both so it never shifts them.
 */
export function PageHead({ title, count, lede, actions, back }: {
  title: React.ReactNode; count?: number; lede?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string };
}) {
  return (
    <div className="mb-7 sm:mb-8">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex min-h-6 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <span aria-hidden>←</span>{back.label}
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <h1 className="flex items-baseline gap-3 font-heading text-[28px] leading-tight font-bold tracking-tight md:text-[32px]">
            {title}
            {count !== undefined && <span className="text-lg font-semibold text-muted-foreground" data-num>{count}</span>}
          </h1>
          {lede && <p className="mt-2 max-w-[62ch] text-[15px] text-pretty text-muted-foreground">{lede}</p>}
        </div>
        {/* Same height as the title's first line (35px / 40px), so a 40px button centres on it. */}
        {actions && <div className="flex flex-wrap items-center gap-2 sm:min-h-[35px] md:min-h-10">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Link-based segmented control (filters that live in the URL). Never wider than its container:
 * on narrow screens it scrolls sideways instead of pushing the page wider.
 */
export function Segments({ label, items, className }: {
  label: string; items: { href: string; label: React.ReactNode; active: boolean }[]; className?: string;
}) {
  return (
    <div role="group" aria-label={label}
      className={cn("inline-flex h-9 max-w-full shrink-0 items-center overflow-x-auto rounded-lg border bg-surface p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          aria-current={it.active ? "true" : undefined}
          className={cn(
            "inline-flex h-full shrink-0 items-center rounded-md px-2.5 text-[13.5px] sm:px-3 font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            it.active && "bg-foreground text-surface hover:text-surface",
          )}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

/** A row of filter controls: wraps on wide screens, one sideways-scrolling line on phones. */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden", className)}>
      {children}
    </div>
  );
}

export function Panel({ children, className, as: As = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "ul" | "ol" | "section" }) {
  return <As className={cn("overflow-hidden rounded-xl border bg-surface", className)}>{children}</As>;
}

/** `level` 1 when the empty state is the whole page (not-found), so the page still has an h1. */
export function EmptyState({ title, text, action, className, level = 2 }: { title: string; text?: React.ReactNode; action?: React.ReactNode; className?: string; level?: 1 | 2 }) {
  const H = level === 1 ? "h1" : "h2";
  return (
    <div className={cn("grid justify-items-center gap-2 rounded-xl border border-dashed bg-surface/60 px-6 py-14 text-center", className)}>
      <H className="font-heading text-lg font-semibold text-balance">{title}</H>
      {text && <p className="max-w-[46ch] text-[14.5px] text-pretty text-muted-foreground">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function RailSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("grid gap-3", className)}>
      <h2 className="font-heading text-[13px] font-semibold tracking-tight text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
