import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createDb, encryptSecret, schema, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
const { authorizeUrl, completeLogin, decodeFlow, encodeFlow } = await import("./oidc");

describe("flow cookie", () => {
  it("rejects tampering and expiry", () => {
    const f = { state: "s", nonce: "n", verifier: "v", ret: "/p/ideas", exp: Math.floor(Date.now() / 1000) + 60 };
    const c = encodeFlow(f);
    expect(decodeFlow(c)).toEqual(f);
    expect(decodeFlow(c.replace(/^./, "x"))).toBeNull();
    expect(decodeFlow(c, Date.now() + 120_000)).toBeNull();
  });
});

// A minimal OpenID provider: discovery, JWKS, token endpoint that checks PKCE and client auth.
const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `oidc-${Date.now()}`;
let server: Server;
let issuer = "";
let project: typeof schema.projects.$inferSelect;
const codes = new Map<string, { challenge: string; nonce: string }>();

describe.skipIf(!up)("OIDC login", () => {
  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
    server = createServer(async (req, res) => {
      const url = new URL(req.url!, issuer);
      const json = (o: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
      if (url.pathname === "/.well-known/openid-configuration") return json({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks` });
      if (url.pathname === "/jwks") return json({ keys: [jwk] });
      if (url.pathname === "/token") {
        let body = ""; for await (const c of req) body += c;
        const p = new URLSearchParams(body);
        const auth = Buffer.from((req.headers.authorization ?? "").replace("Basic ", ""), "base64").toString();
        const entry = codes.get(p.get("code") ?? "");
        if (auth !== "ozvi-client:s3cret" || !entry) return json({ error: "invalid_client" }, 401);
        if (createHash("sha256").update(p.get("code_verifier") ?? "").digest("base64url") !== entry.challenge) return json({ error: "invalid_grant" }, 400);
        const id_token = await new SignJWT({ nonce: entry.nonce, email: "eva@firma.sk", name: "Eva", ozvi_role: "team" })
          .setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(issuer).setAudience("ozvi-client").setSubject("user-77")
          .setIssuedAt().setExpirationTime("5m").sign(privateKey);
        return json({ id_token, access_token: "x", token_type: "Bearer" });
      }
      json({ error: "not found" }, 404);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "OIDC" }).returning();
      project = (await tx.insert(schema.projects).values({
        workspaceId: w!.id, slug, name: "OIDC", theme: presets.ozvi, oidcIssuer: issuer, oidcClientId: "ozvi-client", oidcClientSecretEnc: encryptSecret("s3cret"),
      }).returning())[0]!;
    });
  });
  afterAll(async () => {
    server?.close();
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("logs in with code + PKCE and maps claims", async () => {
    const { url, flow } = await authorizeUrl(project, "http://ozvi.test", `/${slug}/ideas`);
    const q = new URL(url).searchParams;
    expect(q.get("redirect_uri")).toBe(`http://ozvi.test/${slug}/oidc/callback`);
    codes.set("c1", { challenge: q.get("code_challenge")!, nonce: q.get("nonce")! });
    const user = await completeLogin(project, "http://ozvi.test", "c1", flow);
    // ozvi_role in the token is ignored on purpose: roles are managed in Ozvi.
    expect(user).toMatchObject({ externalId: "user-77", email: "eva@firma.sk", name: "Eva", role: "member" });
  });

  it("rejects a wrong nonce or verifier", async () => {
    const { url, flow } = await authorizeUrl(project, "http://ozvi.test", `/${slug}/ideas`);
    const q = new URL(url).searchParams;
    codes.set("c2", { challenge: q.get("code_challenge")!, nonce: "other" });
    await expect(completeLogin(project, "http://ozvi.test", "c2", flow)).rejects.toThrow(/nonce/);
    codes.set("c3", { challenge: q.get("code_challenge")!, nonce: q.get("nonce")! });
    await expect(completeLogin(project, "http://ozvi.test", "c3", { ...flow, verifier: "nope" })).rejects.toThrow(/token endpoint/);
  });
});
