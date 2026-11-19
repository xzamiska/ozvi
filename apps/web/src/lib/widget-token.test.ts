import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { OzviTokenError } from "@ozvi/sdk";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { signWidgetToken, verifyWidgetToken, WIDGET_TOKEN_TTL } = await import("./widget-token");
const { encodeSession, decodeSession } = await import("./session-core");
const { userFromToken } = await import("./sso");
const { emailUser } = await import("./email-user");

const db = createDb();
const reason = (f: () => unknown) => { try { f(); return null; } catch (e) { return e instanceof OzviTokenError ? e.reason : String(e); } };

describe("widget token (ADR-0014): format", () => {
  const c = { projectId: "p1", userId: "u1", sessionVersion: 3 };

  it("round-trips project, user and session version, valid 30 days", () => {
    const now = Date.UTC(2026, 10, 18);
    const tok = signWidgetToken(c, now);
    expect(tok.startsWith("ozw.")).toBe(true);
    expect(verifyWidgetToken(tok, now)).toMatchObject({ p: "p1", u: "u1", v: 3, exp: now / 1000 + WIDGET_TOKEN_TTL });
    expect(reason(() => verifyWidgetToken(tok, now + (WIDGET_TOKEN_TTL + 1) * 1000))).toBe("expired");
  });

  it("a changed payload or signature, or a token from elsewhere, is refused", () => {
    const tok = signWidgetToken(c);
    const [, body, sig] = tok.split(".");
    const other = Buffer.from(JSON.stringify({ p: "p1", u: "admin", v: 3, exp: 9e9 })).toString("base64url");
    expect(reason(() => verifyWidgetToken(`ozw.${other}.${sig}`))).toBe("signature");
    expect(reason(() => verifyWidgetToken(`ozw.${body}.${sig}x`))).toBe("signature");
    expect(reason(() => verifyWidgetToken(`ozw.${body}`))).toBe("malformed");
    expect(reason(() => verifyWidgetToken(`${tok}.extra`))).toBe("malformed");
    expect(reason(() => verifyWidgetToken("eyJhbGciOiJIUzI1NiJ9.e30.x"))).toBe("malformed");
  });

  it("is never a session cookie, and a session cookie is never a widget token (separate signing labels)", () => {
    const tok = signWidgetToken(c);
    expect(decodeSession(tok.slice(4))).toBeNull();
    const cookie = encodeSession({ u: "u1", p: "p1", v: 3, exp: 9e9 });
    expect(reason(() => verifyWidgetToken(`ozw.${cookie}`))).toBe("signature");
  });
});

describe("widget token (ADR-0014): who it signs in", () => {
  const slug = `wtok-${Date.now().toString(36)}`;
  let project: typeof schema.projects.$inferSelect;
  let other: typeof schema.projects.$inferSelect;

  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: slug }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Wtok", theme: presets.ozvi, emailLogin: true }).returning())[0]!;
      other = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug: `${slug}-b`, name: "Other", theme: presets.ozvi, emailLogin: true }).returning())[0]!;
    });
  });

  it("works without SSO configured, as the person who verified the e-mail", async () => {
    const u = await emailUser(project.id, "zakaznik@example.com");
    const back = await userFromToken(project, signWidgetToken({ projectId: project.id, userId: u.id, sessionVersion: u.sessionVersion }));
    expect(back.id).toBe(u.id);
    expect(back.email).toBe("zakaznik@example.com");
    expect(back.role).toBe("member");
    // The same address verified again is the same person (one identity with the board's e-mail sign-in).
    expect((await emailUser(project.id, "zakaznik@example.com")).id).toBe(u.id);
  });

  it("only for its own project", async () => {
    const u = await emailUser(project.id, "a@example.com");
    const tok = signWidgetToken({ projectId: project.id, userId: u.id, sessionVersion: u.sessionVersion });
    await expect(userFromToken(other, tok)).rejects.toThrow(OzviTokenError);
  });

  it("ends with “sign out everywhere” (session version) and when e-mail sign-in is turned off", async () => {
    const u = await emailUser(project.id, "b@example.com");
    const tok = signWidgetToken({ projectId: project.id, userId: u.id, sessionVersion: u.sessionVersion });
    await expect(userFromToken({ ...project, emailLogin: false }, tok)).rejects.toThrow(OzviTokenError);
    await withProject(db, project.id, (tx) => tx.update(schema.users).set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.id, u.id)));
    await expect(userFromToken(project, tok)).rejects.toThrow(OzviTokenError);
  });

  it("ends when the person is deleted", async () => {
    const u = await emailUser(project.id, "c@example.com");
    const tok = signWidgetToken({ projectId: project.id, userId: u.id, sessionVersion: u.sessionVersion });
    await withProject(db, project.id, (tx) => tx.delete(schema.users).where(eq(schema.users.id, u.id)));
    await expect(userFromToken(project, tok)).rejects.toThrow(OzviTokenError);
  });
});

describe("widget token (ADR-0014): the \"My reports\" hand-off", () => {
  const slug = `wopen-${Date.now().toString(36)}`;
  const secret = "wopen-secret-0123456789abcdef-0123456789";
  let project: typeof schema.projects.$inferSelect;
  let owner: typeof schema.users.$inferSelect;

  beforeAll(async () => {
    const { encryptSecret } = await import("@ozvi/db");
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: slug }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Wopen", theme: presets.ozvi, emailLogin: true, ssoSecretEnc: encryptSecret(secret) }).returning())[0]!;
      owner = (await tx.insert(schema.users).values({ projectId: project.id, externalId: "email:owner@wopen.test", email: "owner@wopen.test", emailVerified: true, role: "admin" }).returning())[0]!;
    });
  });

  // Regression (security review 19 Nov 2026, F1): a host app with the SSO secret re-pointed its member's e-mail at
  // the owner's address without proof, then the hand-off resolved that address and signed it in as the admin.
  it("is bound to the token's user, even after the host app changes that user's e-mail to the owner's", async () => {
    const { signOzviToken } = await import("@ozvi/sdk");
    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/[project]/api/widget/login/route");
    const { verifyLink } = await import("./email-login");
    const now = Math.floor(Date.now() / 1000);
    const mallory = await userFromToken(project, signOzviToken({ id: "app-x", email: "mallory@wopen.test", emailVerified: true, iat: now, exp: now + 600 } as never, secret));
    expect((await emailUser(project.id, "mallory@wopen.test")).id).toBe(mallory.id);
    const tok = signWidgetToken({ projectId: project.id, userId: mallory.id, sessionVersion: mallory.sessionVersion });
    await userFromToken(project, signOzviToken({ id: "app-x", email: "owner@wopen.test", emailVerified: false, iat: now, exp: now + 600 } as never, secret));

    const r = await POST(new NextRequest(`http://localhost/${slug}/api/widget/login`, {
      method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ open: "/admin" }),
    }), { params: Promise.resolve({ project: slug }) });
    expect(r.status).toBe(200);
    const url = new URL((await r.json()).url);
    expect(url.pathname).toBe(`/${slug}/widget-open`);
    const row = await verifyLink(db, url.searchParams.get("t")!, project.id, "widget");
    expect(row.email).toBe(mallory.id);
    expect(row.email).not.toBe(owner.id);
    // The same link is no board e-mail sign-in link (that path resolves addresses).
    await expect(verifyLink(db, url.searchParams.get("t")!, project.id, "login")).rejects.toThrow();
  });
});

