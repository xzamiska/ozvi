import { PLAN_LIMITS, schema, withSystem, type Db, type PlanName } from "@ozvi/db";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import { ecomailTransport } from "./ecomail";
import { recipientLocale } from "../../i18n/board";
import { translator } from "../../i18n/messages";
import { renderMail } from "./render";
import { projectOrigin, publicUrl } from "./url";
import { unsubscribeUrl } from "./unsubscribe";
import { parseTheme, presets } from "@ozvi/theme";

/**
 * Single-process e-mail worker (runs inside the web process via instrumentation.ts).
 * Safe to run in several replicas: rows are claimed with FOR UPDATE SKIP LOCKED.
 */

const { emails, projects, workspaces, users } = schema;
const BATCH = 20;
const MAX_ATTEMPTS = 5;
const DIGEST_AFTER_HOURS = 24;

let transport: Transporter | null | undefined;
function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  // Ecomail API wins when configured; otherwise any SMTP server (self-host default).
  transport = process.env.ECOMAIL_API_KEY ? ecomailTransport(process.env.ECOMAIL_API_KEY)
    : process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  return transport;
}
const from = (name: string) => {
  const addr = process.env.OZVI_MAIL_FROM ?? "noreply@ozvi.localhost";
  return `"${name.replace(/["\\]/g, "")}" <${addr}>`;
};

/** RFC 8058 one-click unsubscribe; the POST lands on /<project>/unsubscribe/one-click. */
const listUnsub = (url: string) => ({
  "List-Unsubscribe": `<${url.replace("/unsubscribe?", "/unsubscribe/one-click?")}>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

const unsubUrlFor = (p: { slug: string; customDomain: string | null; customDomainVerifiedAt: Date | null } | undefined, userId: string) =>
  p ? unsubscribeUrl(projectOrigin(p), p.slug, userId) : unsubscribeUrl(publicUrl(), "", userId);

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Transactional mail that must go out now and is not tied to a project's quota (sign-in codes).
 * Returns false when SMTP is not configured.
 */
export async function sendNow(m: { to: string; fromName: string; subject: string; html: string; text: string; kind: string }, t: Transporter | null = getTransport()): Promise<boolean> {
  if (!t) return false;
  await t.sendMail({ from: from(m.fromName), to: m.to, subject: m.subject, html: m.html, text: m.text, headers: { "X-Ozvi-Kind": m.kind } });
  return true;
}

/**
 * Optional scope for a run: only these projects' rows, and "now" for send_after. The live worker uses
 * neither; tests use both so a shared database (other test files, a running dev server) can't race them.
 */
export interface WorkerScope { projectIds?: string[]; now?: Date }
const inScope = (scope: WorkerScope) => (scope.projectIds ? [inArray(emails.projectId, scope.projectIds)] : []);

export async function tick(db: Db, t: Transporter | null = getTransport(), scope: WorkerScope = {}): Promise<{ sent: number; deferred: number; failed: number; digests: number }> {
  const stats = { sent: 0, deferred: 0, failed: 0, digests: 0 };
  await withSystem(db, async (tx) => {
    const batch = await tx.select({ e: emails, plan: workspaces.plan, projectName: projects.name, workspaceId: projects.workspaceId })
      .from(emails)
      .innerJoin(projects, eq(projects.id, emails.projectId))
      .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
      .where(and(eq(emails.status, "queued"), lte(emails.sendAfter, scope.now ?? new Date()), ...inScope(scope)))
      .orderBy(emails.createdAt).limit(BATCH)
      .for("update", { skipLocked: true, of: emails });
    if (batch.length === 0) return;

    const projectIds = [...new Set(batch.map((b) => b.e.projectId))];
    // Plan limits are per workspace (all its projects together), not per project.
    const used = new Map<string, number>();
    for (const r of await tx.select({ w: projects.workspaceId, n: sql<number>`count(*)::int` }).from(emails)
      .innerJoin(projects, eq(projects.id, emails.projectId))
      .where(and(inArray(emails.status, ["sent", "digested"]), gte(emails.sentAt, monthStart()),
        inArray(projects.workspaceId, tx.select({ w: projects.workspaceId }).from(projects).where(inArray(projects.id, projectIds)))))
      .groupBy(projects.workspaceId)) used.set(r.w, r.n);

    const projectRows = new Map((await tx.select({ id: projects.id, slug: projects.slug, customDomain: projects.customDomain, customDomainVerifiedAt: projects.customDomainVerifiedAt })
      .from(projects).where(inArray(projects.id, projectIds))).map((p) => [p.id, p]));
    for (const { e, plan, projectName, workspaceId } of batch) {
      const limit = PLAN_LIMITS[plan as PlanName].emailsPerMonth;
      const n = used.get(workspaceId) ?? 0;
      if (n >= limit) {
        // Over quota: never block, batch into a daily digest instead (ADR-0006).
        await tx.update(emails).set({ status: "deferred" }).where(eq(emails.id, e.id));
        stats.deferred++;
        continue;
      }
      if (!t) {
        await tx.update(emails).set({ status: "skipped", lastError: "no mail transport (SMTP_URL / ECOMAIL_API_KEY)" }).where(eq(emails.id, e.id));
        continue;
      }
      try {
        await t.sendMail({ from: from(projectName), to: e.to, subject: e.subject, html: e.html, text: e.text,
          headers: { "X-Ozvi-Kind": e.kind, ...(e.userId ? listUnsub(unsubUrlFor(projectRows.get(e.projectId), e.userId)) : {}) } });
        await tx.update(emails).set({ status: "sent", sentAt: new Date(), attempts: e.attempts + 1 }).where(eq(emails.id, e.id));
        used.set(workspaceId, n + 1);
        stats.sent++;
      } catch (err) {
        const attempts = e.attempts + 1;
        await tx.update(emails).set({
          attempts, lastError: String(err).slice(0, 500),
          status: attempts >= MAX_ATTEMPTS ? "failed" : "queued",
          sendAfter: new Date(Date.now() + 2 ** attempts * 60_000),
        }).where(eq(emails.id, e.id));
        stats.failed++;
      }
    }
  });
  stats.digests = await digests(db, t, DIGEST_AFTER_HOURS, scope);
  return stats;
}

/** One e-mail per user summarising deferred notifications, once the oldest is a day old. */
export async function digests(db: Db, t: Transporter | null, olderThanHours = DIGEST_AFTER_HOURS, scope: WorkerScope = {}): Promise<number> {
  if (!t) return 0;
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000);
  const due = await withSystem(db, (tx) => tx.select({ projectId: emails.projectId, userId: emails.userId }).from(emails)
    .where(and(eq(emails.status, "deferred"), lte(emails.createdAt, cutoff), ...inScope(scope)))
    .groupBy(emails.projectId, emails.userId).limit(50));
  let count = 0;
  // One transaction per recipient: a failing address must never roll back (and re-send) everyone else's digest.
  for (const { projectId, userId } of due) {
    if (!userId) continue;
    await withSystem(db, async (tx) => {
      const rows = await tx.select().from(emails)
        .where(and(eq(emails.status, "deferred"), eq(emails.projectId, projectId), eq(emails.userId, userId)))
        .for("update", { skipLocked: true });
      if (rows.length === 0) return;
      const ids = rows.map((r) => r.id);
      const [p] = await tx.select().from(projects).where(eq(projects.id, projectId));
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      if (!p || !u?.email || u.emailOptOut) {
        await tx.update(emails).set({ status: "skipped" }).where(inArray(emails.id, ids));
        return;
      }
      let theme;
      try { theme = parseTheme(p.theme); } catch { theme = parseTheme(presets.ozvi); }
      const unsub = unsubscribeUrl(projectOrigin(p), p.slug, u.id);
      const locale = recipientLocale(p, u.locale);
      const msg = translator(locale, "email");
      const mail = renderMail({
        subject: msg("digestSubject", { project: p.name, n: rows.length }),
        summary: "",
        heading: msg("digestHeading"),
        paragraphs: rows.map((r) => `• ${r.summary}`),
        cta: { label: msg("openFeedback"), href: `${projectOrigin(p)}/${p.slug}` },
      }, theme, p.name, unsub, locale);
      try {
        await t.sendMail({ from: from(p.name), to: u.email, subject: mail.subject, html: mail.html, text: mail.text,
          headers: { "X-Ozvi-Kind": "digest", ...listUnsub(unsub) } });
        await tx.update(emails).set({ status: "digested", sentAt: new Date() }).where(inArray(emails.id, ids));
        count++;
      } catch (err) {
        await tx.update(emails).set({ status: "failed", lastError: String(err).slice(0, 500) }).where(inArray(emails.id, ids));
      }
    });
  }
  return count;
}

export function startWorker(db: Db, intervalMs = 5000) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tick(db); } catch (e) { console.error("[ozvi] email worker", e); } finally { running = false; }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
