import { schema, type Db } from "@ozvi/db";
import { and, eq, lte } from "drizzle-orm";
import { logActivity } from "./activity";

/**
 * Plans the operator granted by hand (plan_source = manual) end at plan_until: the workspace goes back
 * to Free, like an expired subscription. Nothing is deleted; over-limit use is never blocked.
 */
export async function expireManualPlans(db: Db, now = new Date()): Promise<number> {
  const ended = await db.update(schema.workspaces)
    .set({ plan: "free", planSource: null, planUntil: null, planStatus: null })
    .where(and(eq(schema.workspaces.planSource, "manual"), lte(schema.workspaces.planUntil, now)))
    .returning({ id: schema.workspaces.id });
  for (const w of ended) await logActivity({ workspaceId: w.id, actor: "Ozvi", action: "plan.changed", detail: "manual → free (expired)" });
  return ended.length;
}
