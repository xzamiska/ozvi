import { schema, withSystem, type Db, type PlanName } from "@ozvi/db";
import { parseTheme, presets } from "@ozvi/theme";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Locale } from "../../i18n/locales";
import { translateFor, type TranslateDeps } from "../translate";
import { renderMail, type Mail } from "./render";
import { unsubscribeUrl } from "./unsubscribe";
import { projectOrigin } from "./url";

/**
 * Worker step before sending (worker.ts tick): mails that quote a post in another language than the recipient's
 * (`emails.translate`, set by notify.ts) get the post translated by AI and are rendered again, with the translation
 * labelled and the original under it. The same rules as reading the post on the board apply (lib/translate.ts:
 * the recipient must be allowed to read it, the board must have translation on, the plan's monthly allowance,
 * the cache). Never blocks a mail: on any failure the mail stays as rendered (original only) and goes out; the
 * send step also stops waiting after TRANSLATE_WAIT_MS.
 */

const { emails, projects, workspaces, users } = schema;

/** How long a mail waits for its translation before it goes out untranslated (worker.ts). */
export const TRANSLATE_WAIT_MS = 3 * 60_000;
const BATCH = 10;

export interface MailTranslation { subject: "comment"; id: string; target: string; mail: Record<string, unknown> }

export async function translateMails(db: Db, opts: { projectIds?: string[]; deps?: Partial<TranslateDeps> } = {}): Promise<number> {
  const rows = await withSystem(db, (tx) => tx.select({ e: emails, project: projects, plan: workspaces.plan, role: users.role })
    .from(emails)
    .innerJoin(projects, eq(projects.id, emails.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .leftJoin(users, eq(users.id, emails.userId))
    .where(and(eq(emails.status, "queued"), isNotNull(emails.translate), ...(opts.projectIds ? [inArray(emails.projectId, opts.projectIds)] : [])))
    .orderBy(emails.createdAt).limit(BATCH));
  let done = 0;
  for (const { e, project, plan, role } of rows) {
    const job = e.translate as MailTranslation;
    let rendered: { html: string; text: string } | null = null;
    try {
      if (e.userId && job?.subject === "comment") {
        const res = await translateFor(db, {
          project, plan: plan as PlanName, target: job.target, rateKey: `mail:${e.userId}`,
          viewer: { userId: e.userId, isTeam: role === "team" || role === "admin" },
          wanted: [{ subject: "comment", id: job.id }], deps: opts.deps,
        });
        const tr = res.translations[0];
        const mail = job.mail as unknown as Mail;
        if (tr && mail.quote && tr.body.trim()) {
          let theme;
          try { theme = parseTheme(project.theme); } catch { theme = parseTheme(presets.ozvi); }
          const out = renderMail({ ...mail, quote: tr.body.slice(0, mail.quote.length + 500), quoteTranslated: { original: mail.quote, model: tr.model } },
            theme, project.name, unsubscribeUrl(projectOrigin(project), project.slug, e.userId), job.target as Locale);
          rendered = { html: out.html, text: out.text };
        }
      }
    } catch (err) {
      // AI off, over the allowance, the provider down: the original goes out.
      console.warn("[ozvi] mail translation", err instanceof Error ? err.message : err);
    }
    await withSystem(db, (tx) => tx.update(emails).set({ translate: null, ...(rendered ?? {}) })
      .where(and(eq(emails.id, e.id), eq(emails.status, "queued"))));
    if (rendered) done++;
  }
  return done;
}
