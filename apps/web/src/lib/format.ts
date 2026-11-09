/** Small, dependency-free formatting helpers shared by server and client components. */

import { LOCALE_TAG, type Locale } from "@/i18n/locales";

export function fileSize(bytes: number, locale: Locale = "sk"): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  const mb = (bytes / 1024 / 1024).toFixed(1);
  return `${locale === "en" ? mb : mb.replace(".", ",")} MB`;
}

export function initials(name: string | null | undefined): string {
  // Letters only: "Peter (tím)" → "PT", not "P(".
  const parts = (name ?? "").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : "")).toUpperCase();
}

const fmt = new Map<Locale, { rtf: Intl.RelativeTimeFormat; df: Intl.DateTimeFormat }>();
function formatters(locale: Locale) {
  let f = fmt.get(locale);
  if (!f) {
    f = {
      rtf: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
      df: new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "numeric", year: "numeric" }),
    };
    fmt.set(locale, f);
  }
  return f;
}
const JUST_NOW: Record<Locale, string> = { sk: "práve teraz", cs: "právě teď", en: "just now", pl: "przed chwilą", hu: "épp most", de: "gerade eben" };

/** "pred 3 hodinami", "včera", then a plain date after a week. */
export function ago(date: Date, locale: Locale = "sk", now = Date.now()): string {
  const { rtf, df } = formatters(locale);
  const s = Math.round((date.getTime() - now) / 1000);
  const a = Math.abs(s);
  if (a < 60) return JUST_NOW[locale];
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return df.format(date);
}

/** "Chrome 141 · macOS" from a user agent; falls back to a trimmed UA. */
export function browserLabel(ua: string): string {
  const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
    : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
    : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`
    : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` : null;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  return b ? [b, os].filter(Boolean).join(" · ") : ua.slice(0, 80);
}
