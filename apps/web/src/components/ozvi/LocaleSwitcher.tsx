"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale } from "next-intl";
import { setLocale } from "@/i18n/actions";
import { LOCALE_NAME, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** Quiet language picker for the board footer; rendered only when the board offers more than one language. */
export function LocaleSwitcher({ locales, label, className }: { locales: readonly Locale[]; label: string; className?: string }) {
  const current = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <nav aria-label={label} className={cn("flex flex-wrap items-center justify-center gap-x-1 text-xs", pending && "opacity-60", className)}>
      {locales.map((l, i) => (
        <span key={l} className="inline-flex items-center gap-x-1">
          {i > 0 && <span aria-hidden className="text-line-strong">·</span>}
          <button
            type="button"
            lang={l}
            aria-current={l === current ? "true" : undefined}
            disabled={pending}
            onClick={() => l !== current && start(async () => { await setLocale(l); router.refresh(); })}
            className={cn("inline-flex min-h-6 items-center rounded px-1.5 text-muted-foreground transition-colors hover:text-foreground", l === current && "font-semibold text-foreground")}
          >
            {LOCALE_NAME[l]}
          </button>
        </span>
      ))}
    </nav>
  );
}
