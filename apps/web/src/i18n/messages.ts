import { createTranslator } from "next-intl";
import cs from "../../messages/cs.json";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import hu from "../../messages/hu.json";
import pl from "../../messages/pl.json";
import sk from "../../messages/sk.json";
import type { Locale } from "./locales";

/** Slovak is the source: its shape types every key (see global.d.ts). */
export type AppMessages = typeof sk;
export const MESSAGES: Record<Locale, AppMessages> = {
  sk, cs: cs as AppMessages, en: en as AppMessages, pl: pl as AppMessages, hu: hu as AppMessages, de: de as AppMessages,
};

export async function loadMessages(locale: Locale): Promise<AppMessages> {
  return MESSAGES[locale];
}

/**
 * Translator outside a request (e-mail worker, jobs): createTranslator with the same messages.
 * Inside a request prefer getTranslations({ locale, namespace }).
 */
const cache = new Map<string, unknown>();
export function translator<N extends keyof AppMessages>(locale: Locale, namespace: N) {
  const key = `${locale}:${namespace}`;
  let t = cache.get(key) as ReturnType<typeof make<N>> | undefined;
  if (!t) cache.set(key, (t = make(locale, namespace)));
  return t;
}
function make<N extends keyof AppMessages>(locale: Locale, namespace: N) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace });
}
