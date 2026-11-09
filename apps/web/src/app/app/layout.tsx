import { parseTheme, presets, toCss } from "@ozvi/theme";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  return { title: (await getTranslations("account"))("meta.console") };
}

const theme = parseTheme(presets.ozvi);

/**
 * Every /app page wears the Ozvi preset (light and dark). Chrome comes from the nested layouts.
 * Language: the explicit choice (cookie, set from the account menu), else Accept-Language, else Slovak.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{toCss(theme)}</style>
      <div className="min-h-dvh bg-background font-brand">{children}</div>
    </>
  );
}
