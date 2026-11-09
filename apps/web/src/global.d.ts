import type { Locale } from "@/i18n/locales";
import type { AppMessages } from "@/i18n/messages";

// Typed keys and arguments for useTranslations / getTranslations (Slovak defines the shape).
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: AppMessages;
  }
}
