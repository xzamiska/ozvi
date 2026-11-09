"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  DropdownMenuCheckboxItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocale } from "@/i18n/actions";
import { useLocale, useTranslations } from "next-intl";
import { isLocale, LOCALE_NAME, LOCALES, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** Remembers the choice (cookie) and re-renders the server tree in the new language. */
function useSwitch() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const choose = (next: string) => {
    if (!isLocale(next)) return;
    start(async () => { await setLocale(next); router.refresh(); });
  };
  return { choose, pending };
}

/** "Jazyk" submenu for the console's account dropdowns: native names, a check on the current one. */
export function LanguageSubmenu() {
  const locale = useLocale();
  const t = useTranslations("console.nav");
  const { choose } = useSwitch();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2"><Languages className="size-4 text-muted-foreground" />{t("language")}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-40">
        {LOCALES.map((l) => (
          <DropdownMenuCheckboxItem key={l} lang={l} checked={l === locale} onCheckedChange={() => l !== locale && choose(l)}>
            {LOCALE_NAME[l]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Inline segmented choice (account page). */
export function LanguageChoice({ label }: { label: string }) {
  const locale = useLocale();
  const { choose, pending } = useSwitch();
  return (
    <div role="radiogroup" aria-label={label} aria-busy={pending || undefined} className="inline-flex flex-wrap gap-1 rounded-lg border bg-wash p-1">
      {LOCALES.map((l: Locale) => (
        <button key={l} type="button" role="radio" aria-checked={l === locale} lang={l} disabled={pending} onClick={() => choose(l)}
          className={cn("rounded-md px-3 py-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground",
            l === locale && "bg-surface text-foreground shadow-xs")}>
          {LOCALE_NAME[l]}
        </button>
      ))}
    </div>
  );
}
