import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { FormGuard } from "@/components/FormGuard";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { translator } from "@/i18n/messages";
import { htmlLocale } from "@/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ozvi",
  description: "Hlásenia chýb a board s nápadmi, ktoré vyzerajú ako vaša appka.",
  // Ozvi's own icon by config, not by an app/icon file: file-based icons win over every segment's
  // metadata, and a board must be able to show its own (app/[project]/layout.tsx).
  icons: { icon: "/ozvi-icon.svg" },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await htmlLocale();
  return (
    <html lang={locale}>
      <body>
        {/* Every page's <main> carries id="main" (components/ozvi/page.tsx and the shells). */}
        <a href="#main" className="oz-skip">{translator(locale, "a11y")("skip")}</a>
        <NextIntlClientProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <FormGuard />
        </NextIntlClientProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
