import { schema, type Tx } from "@ozvi/db";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { fail, isTeamRole, type Item } from "./domain";
import { notifyAssigned } from "./email/notify";
import type { Project, User } from "./project";

/**
 * Who handles an item (internal review 17 Nov 2026: a team of four could not split the work). Team only;
 * the assignee is a team member or admin of this project, or nobody. The assignee hears about it by e-mail,
 * unless they took it themselves. Assignment is internal: customers never see it, webhooks do not carry it.
 */
export async function assignItem(tx: Tx, project: Project, actor: User, item: Item, assigneeId: string | null): Promise<Item | null> {
  if (!isTeamRole(actor.role)) throw fail((t) => t("assignTeamOnly"));
  if ((item.assigneeId ?? null) === assigneeId) return null;
  if (assigneeId) {
    const [who] = await tx.select({ id: schema.users.id, role: schema.users.role }).from(schema.users)
      .where(and(eq(schema.users.id, assigneeId), inArray(schema.users.role, ["team", "admin"])));
    if (!who) throw fail((t) => t("assignNotTeam"));
  }
  const [updated] = await tx.update(schema.items).set({ assigneeId, updatedAt: new Date() }).where(eq(schema.items.id, item.id)).returning();
  if (assigneeId && assigneeId !== actor.id) await notifyAssigned(tx, project, updated!, assigneeId, actor.name);
  return updated!;
}

/** The team members an item can be given to, by name. */
export async function assignableTeam(tx: Tx) {
  const rows = await tx.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users)
    .where(inArray(schema.users.role, ["team", "admin"]));
  return rows.map((r) => ({ id: r.id, label: r.name ?? r.email ?? "—" })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The team's "Assignee" list filter (?who=): "me", "none" or a team member's id; anything else is no filter.
 * Returns the normalized parameter (kept in links) and the condition.
 */
export function assigneeFilter(param: string | undefined, me: string, team: { id: string }[]): { who: string; where: SQL[] } {
  if (param === "me") return { who: "me", where: [eq(schema.items.assigneeId, me)] };
  if (param === "none") return { who: "none", where: [isNull(schema.items.assigneeId)] };
  if (param && team.some((x) => x.id === param)) return { who: param, where: [eq(schema.items.assigneeId, param)] };
  return { who: "", where: [] };
}

/** Options of that filter for a UrlSelect. */
export const assigneeOptions = (t: (k: "whoAny" | "whoMe" | "whoNone") => string, team: { id: string; label: string }[], me: string) => [
  { value: "", label: t("whoAny") }, { value: "me", label: t("whoMe") }, { value: "none", label: t("whoNone") },
  ...team.filter((x) => x.id !== me).map((x) => ({ value: x.id, label: x.label })),
];
