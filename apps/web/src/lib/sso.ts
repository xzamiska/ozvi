import { decryptSecret, schema, withProject } from "@ozvi/db";
import { sql } from "drizzle-orm";
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
  // "email:" ids belong to e-mail sign-in and workspace owners; a host app must not be able to claim them.
  if (/^(email|account):/i.test(claims.id)) throw new Error("SSO user id must not start with email: or account:");
  // The host app may force the user's language; honoured only when the board offers it.
  const locale = isLocale(claims.locale) && boardLocales(project).allowed.includes(claims.locale) ? claims.locale : null;
  const values = {
    projectId: project.id,
    externalId: claims.id,
    email: claims.email ?? null,
    name: claims.name ?? null,
    avatarUrl: claims.avatarUrl ?? null,
    traits: cleanTraits(claims.traits),
    role: (["member", "team", "admin"] as const).includes(claims.role as never) ? claims.role! : "member",
    ...(locale && { locale }),
    lastSeenAt: new Date(),
  };
  // A token without a role leaves the role managed in Ozvi (admin → Ľudia) untouched.
  const hasRole = claims.role !== undefined;
  const [user] = await withProject(db, project.id, (tx) =>
    tx.insert(schema.users).values(values)
      .onConflictDoUpdate({
        target: [schema.users.projectId, schema.users.externalId],
        set: {
          email: values.email, name: values.name, avatarUrl: values.avatarUrl, lastSeenAt: values.lastSeenAt,
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
