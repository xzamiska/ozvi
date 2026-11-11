import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appJwt, githubApp, installationRepos, installerCanSee, installState, installTicket, readInstallState, readInstallTicket } from "./github-app";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const env = { OZVI_GITHUB_APP_ID: "123", OZVI_GITHUB_APP_SLUG: "ozvi", OZVI_GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, "\\n"),
  OZVI_GITHUB_APP_CLIENT_ID: "Iv1.x", OZVI_GITHUB_APP_CLIENT_SECRET: "cs", OZVI_GITHUB_APP_WEBHOOK_SECRET: "ws" };
const app = githubApp(env)!;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

describe("github app", () => {
  it("is off unless every setting is there", () => {
    expect(githubApp({ ...env, OZVI_GITHUB_APP_WEBHOOK_SECRET: "" })).toBeNull();
    expect(app.key).toContain("\n");
    expect(githubApp({ ...env, OZVI_GITHUB_APP_PRIVATE_KEY: Buffer.from(pem).toString("base64") })!.key).toBe(pem.trim());
  });

  it("signs its JWT with the app key, valid under ten minutes", () => {
    const [h, p, s] = appJwt(app, 1_700_000_000_000).split(".");
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, s!, "base64url")).toBe(true);
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
    expect(claims.iss).toBe("123");
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });

  it("state and ticket: signed, kind-bound, expiring", () => {
    const s = installState({ p: "proj", u: "user", s: "slug" }, 1000);
    expect(readInstallState(s, 2000)).toMatchObject({ p: "proj", u: "user" });
    expect(readInstallState(s, 1000 + 31 * 60_000)).toBeNull();
    expect(readInstallTicket(s, 2000)).toBeNull(); // a state is not a ticket
    const [body, sig] = installTicket({ p: "proj", u: "user", i: 7 }, 1000).split(".");
    const forged = Buffer.from(JSON.stringify({ p: "proj", u: "user", i: 8, exp: 9e15 })).toString("base64url");
    expect(readInstallTicket(`${forged}.${sig}`, 2000)).toBeNull();
    expect(readInstallTicket(`${body}.${sig}`, 2000)).toMatchObject({ i: 7 });
  });

  it("accepts an installation only if the installer can see it", async () => {
    const f = (installations: number[]) => (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("login/oauth")) return json({ access_token: "user-token" });
      if (u.includes("/user/installations")) return json({ installations: installations.map((id) => ({ id })) });
      return json({}, 404);
    }) as typeof fetch;
    expect(await installerCanSee(app, "code", 7, f([3, 7]))).toBe(true);
    expect(await installerCanSee(app, "code", 7, f([3]))).toBe(false);
    const bad = (async () => json({ error: "bad_verification_code" })) as unknown as typeof fetch;
    expect(await installerCanSee(app, "code", 7, bad)).toBe(false);
  });

  it("lists every repository the installation sees", async () => {
    const all = Array.from({ length: 130 }, (_, i) => ({ full_name: `org/r${String(i).padStart(3, "0")}` }));
    const f = (async (url: string | URL | Request) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/access_tokens")) return json({ token: "inst", expires_at: new Date(Date.now() + 3600_000).toISOString() }, 201);
      const page = Number(u.searchParams.get("page"));
      return json({ total_count: all.length, repositories: all.slice((page - 1) * 100, page * 100) });
    }) as typeof fetch;
    const repos = await installationRepos(app, 99, f);
    expect(repos).toHaveLength(130);
    expect(repos[0]).toBe("org/r000");
  });
});
