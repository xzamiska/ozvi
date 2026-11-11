import { PLAN_LIMITS, schema, withProject, type Db, type PlanName } from "@ozvi/db";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { ozviMailTheme, renderMail } from "./email/render";
import { publicUrl } from "./email/url";
import { sendNow } from "./email/worker";
import { translationsUsed } from "./translate";

/**
 * Tells a cloud workspace's owners when a monthly allowance is nearly used up (80 %) and when it is
 * used up (100 %): e-mails and AI translations. Once per allowance, month and threshold
 * (usage_alerts); reaching 100 % first also marks 80 % so nobody gets the older news afterwards.
 * Nothing is ever blocked by a limit: e-mails over it go out as a daily digest, translations stop
 * until the 1st and the original stays.
 */

export type AlertKind = "emails" | "translations";
const LEVELS = [100, 80] as const;
const CLOUD_PLANS: PlanName[] = ["free", "pro", "studio"];
const { usageAlerts, workspaces, projects, workspaceMembers, accounts } = schema;

const period = (now: number) => new Date(now).toISOString().slice(0, 7);
const monthStart = (now: number) => { const d = new Date(now); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };

/** The highest threshold reached (100, 80) or null. */
export function levelOf(used: number, limit: number): 100 | 80 | null {
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return LEVELS.find((l) => used >= (limit * l) / 100) ?? null;
}

async function emailsUsed(db: Db, boards: string[], now: number): Promise<number> {
  let n = 0;
  for (const id of boards) {
    n += await withProject(db, id, async (tx) => {
      const [e] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.emails)
        .where(and(inArray(schema.emails.status, ["sent", "digested"]), gte(schema.emails.sentAt, monthStart(now))));
      return e?.n ?? 0;
    });
  }
  return n;
}

export interface AlertDeps { now?: () => number; send?: typeof sendNow }

/** Worker step (hourly, cloud only). Returns how many alert e-mails went out. */
export async function usageAlertsTick(db: Db, deps: AlertDeps = {}): Promise<number> {
  if (process.env.OZVI_MODE !== "cloud") return 0;
  const now = (deps.now ?? Date.now)();
  const send = deps.send ?? sendNow;
  const list = await db.select({ id: workspaces.id, name: workspaces.name, plan: workspaces.plan }).from(workspaces)
    .where(inArray(workspaces.plan, CLOUD_PLANS));
  let sent = 0;
  for (const ws of list) {
    const limits = PLAN_LIMITS[ws.plan as PlanName];
    const boards = await db.select({ id: projects.id, locale: projects.defaultLocale }).from(projects)
      .where(eq(projects.workspaceId, ws.id)).orderBy(asc(projects.createdAt));
    if (boards.length === 0) continue;
    const ids = boards.map((b) => b.id);
    const checks: { kind: AlertKind; used: number; limit: number }[] = [
      { kind: "emails", used: await emailsUsed(db, ids, now), limit: limits.emailsPerMonth },
      ...(limits.translationsPerMonth > 0 ? [{ kind: "translations" as const, used: await translationsUsed(db, ws.id, now), limit: limits.translationsPerMonth }] : []),
    ];
    for (const c of checks) {
      const level = levelOf(c.used, c.limit);
      if (!level) continue;
      // Claim the threshold (and the lower one) first: only the run that inserts it sends.
      const claimed = await db.insert(usageAlerts).values(LEVELS.filter((l) => l <= level).map((l) => ({ workspaceId: ws.id, kind: c.kind, period: period(now), level: l })))
        .onConflictDoNothing().returning({ level: usageAlerts.level });
      if (!claimed.some((r) => r.level === level)) continue;
      const owners = await db.select({ email: accounts.email }).from(workspaceMembers).innerJoin(accounts, eq(accounts.id, workspaceMembers.accountId))
        .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.role, "owner")));
      const locale: Locale = isLocale(boards[0]!.locale) ? boards[0]!.locale : "sk";
      const mail = alertMail(ws, c.kind, level, c.used, c.limit, locale);
      for (const o of owners) {
        try { if (await send({ to: o.email, fromName: "Ozvi", subject: mail.subject, html: mail.html, text: mail.text, kind: `usage-${c.kind}-${level}` })) sent++; }
        catch (e) { console.error("[ozvi] usage alert", e); }
      }
    }
  }
  return sent;
}

export function alertMail(ws: { id: string; name: string; plan: string }, kind: AlertKind, level: 80 | 100, used: number, limit: number, locale: Locale) {
  const t = translator(locale, "account");
  const n = (x: number) => x.toLocaleString(locale);
  const key = `usage.${kind}${level}` as const;
  return renderMail({
    subject: t(`${key}.subject`, { ws: ws.name }),
    summary: t(`${key}.summary`, { used: n(used), limit: n(limit) }),
    heading: t(`${key}.heading`),
    paragraphs: [t(`${key}.body`, { used: n(used), limit: n(limit), ws: ws.name }), t(`usage.${kind}What`), ...(ws.plan === "studio" ? [] : [t("usage.upgrade")])],
    cta: { label: t("usage.cta"), href: `${publicUrl().replace(/\/$/, "")}/app/w/${ws.id}/plan` },
  }, ozviMailTheme(), "Ozvi", null, locale);
}
