import { decryptSecret, schema, withProject } from "@ozvi/db";
import { and, eq, sql } from "drizzle-orm";
import { verifyOzviToken, type OzviClaims } from "@ozvi/sdk";
import { boardLocales } from "@/i18n/board";
import { isLocale } from "@/i18n/locales";
import type { Project } from "./project";
import { cleanTraits } from "./traits";
import { db } from "./db";

/** Verifies a host-app token for a project and upserts the user. Throws OzviTokenError on bad tokens. */
export async function userFromToken(project: Project, token: string) {
  if (!project.ssoSecretEnc) throw new Error("SSO is not configured for this project");
  const claims: OzviClaims = verifyOzviToken(token, decryptSecret(project.ssoSecretEnc));
  // "email:" ids belong to e-mail sign-in and workspace owners; a host app must not be able to claim them
  // (an app account opened with someone else's address would take over their board account). The one
  // exception is Ozvi's own board: its tokens come from the console, for an address the console verified.
  const ownBoard = process.env.OZVI_MODE === "cloud" && !!process.env.OZVI_FEEDBACK_PROJECT && project.slug === process.env.OZVI_FEEDBACK_PROJECT.trim();
  if (/^account:/i.test(claims.id) || (/^email:/i.test(claims.id) && !ownBoard)) throw new Error("SSO user id must not start with email: or account:");
  // The host app may force the user's language; honoured only when the board offers it.
  const locale = isLocale(claims.locale) && boardLocales(project).allowed.includes(claims.locale) ? claims.locale : null;
  const values = {
    projectId: project.id,
    externalId: claims.id,
    email: claims.email ?? null,
    // Only the app's explicit word: an address it did not verify must never join anyone's account.
    emailVerified: !!claims.email && claims.emailVerified === true,
    name: claims.name ?? null,
    avatarUrl: claims.avatarUrl ?? null,
    traits: cleanTraits(claims.traits),
    role: (["member", "team", "admin"] as const).includes(claims.role as never) ? claims.role! : "member",
    ...(locale && { locale }),
    lastSeenAt: new Date(),
  };
  // A token without a role leaves the role managed in Ozvi (admin → Ľudia) untouched.
  const hasRole = claims.role !== undefined;

  // The app vouches for the e-mail: the same person as whoever signed in with it by e-mail (one account,
  // not two). Only for a person the app has not signed in before, and only into a plain member account:
  // team and admin accounts (the console owner's included) are never joined automatically.
  if (values.emailVerified) {
    const linked = await withProject(db, project.id, async (tx) => {
      const [mine] = await tx.select({ id: schema.users.id }).from(schema.users)
        .where(and(eq(schema.users.projectId, project.id), eq(schema.users.externalId, claims.id))).limit(1);
      if (mine) return null;
      const [same] = await tx.select().from(schema.users)
        .where(and(sql`lower(${schema.users.email}) = ${claims.email!.toLowerCase()}`, sql`${schema.users.externalId} like 'email:%'`, eq(schema.users.role, "member"))).limit(1);
      if (!same) return null;
      return (await tx.update(schema.users).set({
        name: values.name ?? same.name, avatarUrl: values.avatarUrl ?? same.avatarUrl, lastSeenAt: values.lastSeenAt,
        ...(claims.traits !== undefined && { traits: values.traits }),
        ...(locale && { locale }),
      }).where(eq(schema.users.id, same.id)).returning())[0] ?? null;
    });
    if (linked) return { ...linked, forcedLocale: locale };
  }
  const [user] = await withProject(db, project.id, (tx) =>
    tx.insert(schema.users).values(values)
      .onConflictDoUpdate({
        target: [schema.users.projectId, schema.users.externalId],
        set: {
          email: values.email, emailVerified: values.emailVerified, name: values.name, avatarUrl: values.avatarUrl, lastSeenAt: values.lastSeenAt,
          // A token without traits keeps the stored ones (customer data shown to the team).
          ...(claims.traits !== undefined && { traits: values.traits }),
          ...(locale && { locale }),
          ...(hasRole && { role: values.role }),
          // Losing a role signs the user out of other sessions at once.
          sessionVersion: hasRole ? sql`case when ${schema.users.role} <> ${values.role} then ${schema.users.sessionVersion} + 1 else ${schema.users.sessionVersion} end` : schema.users.sessionVersion,
        },
      })
      .returning());
  return { ...user!, forcedLocale: locale };
}
