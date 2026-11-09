"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "./locales";
import { LOCALE_MAX_AGE } from "@/lib/storage-keys";

/** Remember an explicit language choice for a year (console and boards). */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: LOCALE_MAX_AGE, sameSite: "lax" });
}
