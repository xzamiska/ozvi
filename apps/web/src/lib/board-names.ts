import { schema, withProject, type Db } from "@ozvi/db";
import { and, eq, inArray } from "drizzle-orm";

/**
 * A console account's name on the boards of its workspaces. The hand-off from the console writes it when a
 * person opens a board; this carries a later rename to every board at once, so the team sees "Zuzana Dev"
 * in pickers and rows instead of an e-mail address. Only the team account (`email:<address>`, team or admin)
 * is touched: a customer account with the same address is someone the host app vouches for, not this one.
 * Returns how many board users were renamed.
 */
export async function syncBoardNames(db: Db, account: { id: string; email: string; name: string | null }): Promise<number> {
  const boards = await db.select({ id: schema.projects.id }).from(schema.projects)
    .innerJoin(schema.workspaceMembers, eq(schema.workspaceMembers.workspaceId, schema.projects.workspaceId))
    .where(eq(schema.workspaceMembers.accountId, account.id));
  let n = 0;
  for (const b of boards) {
    n += (await withProject(db, b.id, (tx) => tx.update(schema.users).set({ name: account.name?.trim() || null })
      .where(and(eq(schema.users.externalId, `email:${account.email.toLowerCase()}`), inArray(schema.users.role, ["team", "admin"])))
      .returning({ id: schema.users.id }))).length;
  }
  return n;
}
