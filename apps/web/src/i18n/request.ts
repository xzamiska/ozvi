import { getRequestConfig } from "next-intl/server";
import { isLocale } from "./locales";
import { loadMessages } from "./messages";
import { boardSlugOfRequest, htmlLocale } from "./server";

/**
 * next-intl request config (same setup as Billiwo and Apinido, without path routing outside the
 * landing). The locale comes from the page: the landing path, the board's language rules, or the
 * console's cookie → Accept-Language. getTranslations({ locale }) overrides it (e-mails, SSO).
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const asked = await requestLocale;
  const locale = isLocale(asked) ? asked : await htmlLocale();
  const messages = await loadMessages(locale);
  // A board may rename its route stops (custom statuses): every "route.label" lookup on that board,
  // server or client, then speaks the board's words. Stages and their logic stay the same.
  const slug = await boardSlugOfRequest();
  if (slug) {
    const { stageLabelsForSlug } = await import("@/lib/project");
    const labels = await stageLabelsForSlug(slug, locale);
    if (labels) return { locale, messages: { ...messages, route: { ...messages.route, label: { ...messages.route.label, ...labels } } }, timeZone: "Europe/Bratislava" };
  }
  return { locale, messages, timeZone: "Europe/Bratislava" };
});
