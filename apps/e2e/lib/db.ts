import "./env";
import { createDb, encryptSecret, schema } from "@ozvi/db";
import { signOzviToken, type OzviUser } from "@ozvi/sdk";
import { eq } from "drizzle-orm";
import { E2E } from "./env";

export const db = createDb(E2E.databaseUrl);
export { schema };

/** Turns SSO on for a project with a known secret and returns it (what the admin "Turn on SSO" does). */
export async function enableSso(slug: string, secret = "e2e-sso-secret-0123456789abcdef0123456789") {
  await db.update(schema.projects).set({ ssoSecretEnc: encryptSecret(secret, E2E.secretKey) }).where(eq(schema.projects.slug, slug));
  return secret;
}

/** A host-app SSO link (/<slug>/sso?token=…) for a person, like a host app would build it. */
export function ssoUrl(slug: string, secret: string, user: OzviUser, returnTo = `/${slug}/ideas`) {
  return `/${slug}/sso?token=${encodeURIComponent(signOzviToken(user, secret))}&return=${encodeURIComponent(returnTo)}`;
}

export async function projectBySlug(slug: string) {
  return db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) });
}
