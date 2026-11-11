import { createDb, encryptSecret, schema, withSystem } from "@ozvi/db";
import { signOzviToken } from "@ozvi/sdk";
import { presets } from "@ozvi/theme";
import { beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { userFromToken } = await import("./sso");
const db = createDb();
const secret = "sso-link-secret-0123456789abcdef-0123456789";
const slug = `ssol-${Date.now().toString(36)}`;
let project: typeof schema.projects.$inferSelect;
let owner = "";

describe("one account per verified e-mail (SSO ↔ e-mail sign-in)", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: slug }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Link", theme: presets.ozvi, ssoSecretEnc: encryptSecret(secret) }).returning())[0]!;
      owner = (await tx.insert(schema.users).values({ projectId: project.id, externalId: "email:owner@example.com", email: "owner@example.com", emailVerified: true, role: "admin" }).returning())[0]!.id;
    });
  });

  it("emailVerified: false in the token never lands in the e-mail account", async () => {
    const u = await userFromToken(project, signOzviToken({ id: "app-1", email: "owner@example.com", emailVerified: false }, secret));
    expect(u.id).not.toBe(owner);
    expect(u.emailVerified).toBe(false);
  });

  it("with the setting off, an app e-mail without the claim is not trusted", async () => {
    const u = await userFromToken({ ...project, trustAppEmails: false }, signOzviToken({ id: "app-3", email: "owner@example.com" }, secret));
    expect(u.id).not.toBe(owner);
  });

  it("by default (the app verifies e-mails) it is the same person, and the role stays", async () => {
    const u = await userFromToken(project, signOzviToken({ id: "app-2", email: "Owner@Example.com", role: "member" }, secret));
    expect(u.id).toBe(owner);
    expect(u.role).toBe("admin");
  });

  it("someone the app already signed in keeps their own account", async () => {
    const u = await userFromToken(project, signOzviToken({ id: "app-1", email: "owner@example.com", emailVerified: true }, secret));
    expect(u.id).not.toBe(owner);
  });
});
