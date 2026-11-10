import { translator } from "@/i18n/messages";
import type { Locale } from "@/i18n/locales";
import type { Mail } from "./email/render";

/** What the ozvi-updater sidecar reports to the web app (POST /api/updater/event). */
export interface UpdaterEvent {
  type: "available" | "started" | "updated" | "rolledBack" | "failed";
  from?: string | null;
  to?: string | null;
  reason?: string;
  url?: string;
  breaking?: boolean;
  message?: string;
  backup?: string;
}

const short = (s: string | undefined, n = 400) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * The operator e-mail for an event. Only problems are mailed (rolled back, failed); a new version and a
 * successful update show in the admin's Updates section only, never in anyone's inbox.
 */
export function updaterMail(e: UpdaterEvent, ctx: { server: string; settingsUrl: string | null }, locale: Locale): Mail | null {
  const t = translator(locale, "email");
  const from = short(e.from ?? "?", 40), to = short(e.to ?? "?", 40);
  const cta = ctx.settingsUrl ? { label: t("updater.open"), href: ctx.settingsUrl } : undefined;
  switch (e.type) {
    case "rolledBack": {
      const subject = t("updater.rolledBack.subject", { to, from });
      return {
        subject, summary: subject, heading: subject, cta,
        paragraphs: [t("updater.rolledBack.text", { url: ctx.server, from }), t("updater.rolledBack.reason", { message: short(e.message) }), t("updater.rolledBack.next")],
      };
    }
    case "failed": {
      const subject = t("updater.failed.subject");
      return {
        subject, summary: subject, heading: subject, cta,
        paragraphs: [t("updater.failed.text", { url: ctx.server }), t("updater.failed.reason", { message: short(e.message) }),
          ...(e.backup ? [t("updater.updated.backup", { file: short(e.backup, 200) })] : []), t("updater.failed.restore")],
      };
    }
    default:
      return null;
  }
}
