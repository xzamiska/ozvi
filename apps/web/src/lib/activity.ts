import "server-only";
import { schema } from "@ozvi/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import { MESSAGES, translator, type AppMessages } from "@/i18n/messages";
import { db } from "./db";
import { decodeReport } from "./retention";

/**
 * Workspace activity log for the console ("Aktivita"). Writing never breaks the action it records:
 * a failed insert is logged and swallowed.
 */

/** Stored action codes ("project.created"): the nesting of console.activity.actions in the messages. */
type Actions = AppMessages["console"]["activity"]["actions"];
export type ActivityAction = { [G in keyof Actions]: `${G & string}.${keyof Actions[G] & string}` }[keyof Actions];

/** Creem events are logged with actor "Creem"; older rows carry the Slovak label. */
const GATEWAY = new Set(["Creem", MESSAGES.sk.console.activity.paymentGateway]);

/** Display label of an activity row in a locale (unknown actions show their key). */
export function activityLabel(action: string, locale: Locale): string {
  const t = translator(locale, "console");
  const key = `activity.actions.${action}` as `activity.actions.${ActivityAction}`;
  return /^[a-z_]+\.[a-z_]+$/.test(action) && t.has(key) ? t(key) : action;
}

/** Role codes stored in details ("x@y.sk (owner)", "x@y.sk → member", or older Slovak labels) follow the reader's language. */
const ROLE_CODE = new Map<string, string>([["owner", "owner"], ["member", "member"],
  ...Object.entries(MESSAGES.sk.console.role).map(([code, label]) => [label, code] as [string, string])]);
export function activityDetail(action: string, detail: string | null, locale: Locale): string | null {
  if (action === "retention.run") {
    const r = decodeReport(detail);
    if (!r) return detail;
    const t = translator(locale, "console");
    const mb = (r.bytes / 1024 / 1024).toLocaleString(LOCALE_TAG[locale], { maximumFractionDigits: 1 });
    return [
      r.captures && t("activity.retention.captures", { n: r.captures }),
      r.screenshots && t("activity.retention.screenshots", { n: r.screenshots }),
      r.files && t("activity.retention.files", { n: r.files }),
      r.bytes && t("activity.retention.freed", { mb }),
      r.contacts && t("activity.retention.contacts", { n: r.contacts }),
    ].filter(Boolean).join(" · ");
  }
  if (!detail || (action !== "member.invited" && action !== "member.role")) return detail;
  const m = /^(.*(?:\(|→ ))([^()]+?)(\)?)$/u.exec(detail);
  const code = m && ROLE_CODE.get(m[2]!);
  return m && code ? `${m[1]}${translator(locale, "console")(`role.${code as "owner" | "member"}`)}${m[3]}` : detail;
}

export function activityActor(actor: string | null, locale: Locale): string | null {
  return actor && GATEWAY.has(actor) ? translator(locale, "console")("activity.paymentGateway") : actor;
}

export async function logActivity(e: { workspaceId: string; projectId?: string | null; actor: string | null; action: ActivityAction; detail?: string | null }) {
  try {
    await db.insert(schema.activity).values({
      workspaceId: e.workspaceId, projectId: e.projectId ?? null, actor: e.actor, action: e.action, detail: e.detail ?? null,
    });
  } catch (err) {
    console.error("[activity] not recorded", e.action, err);
  }
}

/** Display label for a board user or an account. */
export const who = (p: { name?: string | null; email?: string | null } | null | undefined) => p?.name || p?.email || null;

export async function activityOf(workspaceId: string, opts: { before?: Date; limit?: number } = {}) {
  const limit = opts.limit ?? 50;
  return db.select({ a: schema.activity, project: schema.projects.name }).from(schema.activity)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.activity.projectId))
    .where(and(eq(schema.activity.workspaceId, workspaceId), opts.before ? lt(schema.activity.createdAt, opts.before) : undefined))
    .orderBy(desc(schema.activity.createdAt)).limit(limit);
}
