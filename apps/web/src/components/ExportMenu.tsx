"use client";

import { Download, FileSpreadsheet, MessageSquareText, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CSV_SEP_KEY } from "@/lib/storage-keys";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Sep = "semicolon" | "comma";
const KEY = CSV_SEP_KEY;

/**
 * Team "Export" for a list: the rows on screen (same filters and search, all pages) as CSV, plus its
 * comments and voters. The separator choice is remembered per browser; default follows the language
 * (Slovak/Czech Excel splits on `;`).
 */
/** The remembered CSV separator (default by language). */
function useSep() {
  const locale = useLocale();
  const [sep, setSep] = useState<Sep>(locale === "en" ? "comma" : "semicolon");
  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === "comma" || v === "semicolon") setSep(v); } catch { /* private mode */ }
  }, []);
  return [sep, setSep] as const;
}

/** Team, idea detail: this idea's voters as CSV (same file as the list export, one item). */
export function VotersExport({ slug, number }: { slug: string; number: number }) {
  const t = useTranslations("export.menu");
  const [sep] = useSep();
  return (
    <Button asChild variant="outline" size="sm" className="justify-self-start">
      <a href={`/${slug}/export?${new URLSearchParams({ what: "voters", of: "idea", item: String(number), sep })}`} download><Users />{t("voters")}</a>
    </Button>
  );
}

export function ExportMenu({ slug, kind, query, size = "lg", label }: { slug: string; kind: "idea" | "bug"; query: Record<string, string>; size?: "lg" | "default" | "sm"; label?: string }) {
  const t = useTranslations("export.menu");
  const [sep, setSep] = useSep();
  const choose = (v: string) => {
    const s: Sep = v === "comma" ? "comma" : "semicolon";
    setSep(s);
    try { localStorage.setItem(KEY, s); } catch { /* ignore */ }
  };
  const href = (what: string) => `/${slug}/export?${new URLSearchParams({ ...query, what, of: kind, sep })}`;
  const list = kind === "idea" ? "ideas" : "bugs";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size={size}><Download />{label ?? t("button")}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">{label ? t("all") : t("filtered")}</DropdownMenuLabel>
        <DropdownMenuItem asChild><a href={href(list)} download><FileSpreadsheet />{t(list)}</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={href("comments")} download><MessageSquareText />{t("comments")}</a></DropdownMenuItem>
        {kind === "idea" && <DropdownMenuItem asChild><a href={href("voters")} download><Users />{t("voters")}</a></DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[12px] font-medium text-muted-foreground">{t("separator")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sep} onValueChange={choose}>
          <DropdownMenuRadioItem value="semicolon" onSelect={(e) => e.preventDefault()}>
            <span className="grid"><span>{t("semicolon")}</span><span className="text-[12px] text-muted-foreground">{t("semicolonHint")}</span></span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="comma" onSelect={(e) => e.preventDefault()}>
            <span className="grid"><span>{t("comma")}</span><span className="text-[12px] text-muted-foreground">{t("commaHint")}</span></span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
