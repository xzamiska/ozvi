import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCtx } from "@/lib/project";

type Params = Promise<{ project: string }>;

/**
 * Page <title> for a board page (WCAG 2.4.2): "<page> – <project>" via the layout's template.
 * `ns`/`key` point at the same message the page shows as its heading.
 */
export function boardTitle(ns: string, key = "title") {
  return async ({ params }: { params: Params }): Promise<Metadata> => {
    const { locale } = await getCtx((await params).project);
    const t = await getTranslations({ locale, namespace: ns as never });
    return { title: (t as unknown as (k: string) => string)(key) };
  };
}

/** Console page <title>: "<section> – Ozvi – console" (WCAG 2.4.2). `key` is a console.nav message. */
export function consoleTitle(key: "overview" | "team" | "plan" | "delivery" | "activity" | "settings") {
  return async (): Promise<Metadata> => {
    const nav = await getTranslations("console.nav");
    const meta = await getTranslations("account.meta");
    return { title: `${nav(key)} – ${meta("console")}` };
  };
}
