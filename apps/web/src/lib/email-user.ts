import { schema, withProject } from "@ozvi/db";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "./db";

/**
 * The person behind an e-mail address someone just proved (a code or a link): whoever in this project already
 * has that e-mail proven (an e-mail user, or one the host app signed in with emailVerified), so it is one
 * identity with the same reports and name. Only a brand-new address gets its own `email:` user, without a
 * made-up name. Used by board sign-in and by the widget's e-mail verification (ADR-0014).
 */
export async function emailUser(projectId: string, email: string) {
  return withProject(db, projectId, async (tx) => {
    // Only an account whose e-mail is proven too: an app that did not verify the address (no emailVerified
    // in its token) must not put this person into an account someone else opened with their address.
    // An app account with team or admin rights is never joined this way.
    const [known] = await tx.select().from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${email} and (${schema.users.externalId} like 'email:%' or (${schema.users.emailVerified} and ${schema.users.role} = 'member'))`)
      .orderBy(sql`${schema.users.externalId} like 'email:%'`, asc(schema.users.createdAt)).limit(1);
    // Signing in makes an imported placeholder a real person: retention never anonymises them.
    if (known) return (await tx.update(schema.users).set({ lastSeenAt: new Date() }).where(eq(schema.users.id, known.id)).returning())[0] ?? known;
    const [created] = await tx.insert(schema.users)
      .values({ projectId, externalId: `email:${email}`, email, emailVerified: true, name: null, lastSeenAt: new Date() })
      .onConflictDoUpdate({ target: [schema.users.projectId, schema.users.externalId], set: { email, lastSeenAt: new Date() } })
      .returning();
    return created!;
  });
}
