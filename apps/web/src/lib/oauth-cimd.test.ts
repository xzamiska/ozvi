import { beforeEach, describe, expect, it, vi } from "vitest";
import { CimdError, cacheTtl, checkClientIdUrl, clearCimdCache, loopbackOnly, parseClientMetadata, resolveClientMetadata } from "./oauth-cimd";
import { resourceMatches, validRedirectUri } from "./oauth-uri";

const ID = "https://app.example.com/oauth/client.json";
const doc = (over: Record<string, unknown> = {}) => ({
  client_id: ID, client_name: "Example MCP", redirect_uris: ["http://127.0.0.1:3000/callback", "https://app.example.com/cb"],
  logo_uri: "https://app.example.com/logo.png", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
  token_endpoint_auth_method: "none", ...over,
});
const json = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("client_id URL rules", () => {
  it("accepts https URLs with a path", () => {
    expect(checkClientIdUrl(ID)).toBeNull();
    expect(checkClientIdUrl("https://claude.ai/oauth/mcp-oauth-client-metadata")).toBeNull();
  });
  it.each([
    ["http://app.example.com/c.json", /https/],
    ["https://app.example.com", /path/],
    ["https://app.example.com/", /path/],
    ["https://app.example.com/c.json#x", /fragment/],
    ["https://u:p@app.example.com/c.json", /credentials/],
    ["https://app.example.com/a/../c.json", /dot segments/],
    ["https://APP.example.com/c.json", /canonical/],
    ["https://app.example.com:443/c.json", /canonical/],
    ["https://127.0.0.1/c.json", /address/],
    ["https://localhost/c.json", /address/],
    ["https://10.0.0.5/c.json", /address/],
    ["https://[::1]/c.json", /address/],
    ["https://metadata.internal/c.json", /address/],
  ])("refuses %s", (url, why) => { expect(checkClientIdUrl(url)).toMatch(why); });
});

describe("metadata document validation", () => {
  it("parses a valid document; the host comes from the URL, not the document", () => {
    const m = parseClientMetadata(ID, doc({ client_uri: "https://evil.example/" }));
    expect(m).toMatchObject({ clientId: ID, host: "app.example.com", name: "Example MCP", logoUri: "https://app.example.com/logo.png" });
    expect(m.redirectUris).toHaveLength(2);
  });
  it.each([
    [{ client_id: "https://other.example.com/c.json" }, /does not match/],
    [{ client_id: `${ID}/` }, /does not match/],
    [{ client_secret: "s" }, /secret/],
    [{ token_endpoint_auth_method: "client_secret_basic" }, /not supported/],
    [{ token_endpoint_auth_method: "private_key_jwt" }, /not supported/],
    [{ redirect_uris: [] }, /redirect_uris/],
    [{ redirect_uris: ["http://evil.example/cb"] }, /redirect_uris/],
    [{ redirect_uris: ["https://app.example.com/cb#f"] }, /redirect_uris/],
    [{ redirect_uris: "https://app.example.com/cb" }, /redirect_uris/],
    [{ grant_types: ["client_credentials"] }, /grant_types/],
    [{ response_types: ["token"] }, /response_types/],
    [{ client_name: "" }, /client_name/],
    [{ client_name: undefined }, /client_name/],
  ])("rejects %j", (over, why) => { expect(() => parseClientMetadata(ID, doc(over))).toThrow(why); });
  it("accepts the real documents of Claude and VS Code (captured 2026-11-08)", () => {
    const claude = { client_id: "https://claude.ai/oauth/mcp-oauth-client-metadata", client_name: "Claude", client_uri: "https://claude.ai", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:jwt-bearer"], response_types: ["code"], token_endpoint_auth_method: "none" };
    const vscode = { client_name: "Visual Studio Code", logo_uri: "https://code.visualstudio.com/assets/branding/code-stable.png", grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"], response_types: ["code"], token_endpoint_auth_method: "none", application_type: "native", client_id: "https://vscode.dev/oauth/client-metadata.json", client_uri: "https://vscode.dev/product", redirect_uris: ["http://127.0.0.1:33418/", "https://vscode.dev/redirect"] };
    expect(parseClientMetadata(claude.client_id, claude)).toMatchObject({ host: "claude.ai", name: "Claude" });
    expect(parseClientMetadata(vscode.client_id, vscode)).toMatchObject({ host: "vscode.dev", logoUri: vscode.logo_uri });
    expect(checkClientIdUrl(vscode.client_id)).toBeNull();
  });
  it("rejects non-objects", () => {
    expect(() => parseClientMetadata(ID, [doc()])).toThrow(CimdError);
    expect(() => parseClientMetadata(ID, null)).toThrow(CimdError);
  });
  it("cleans the name and drops non-https logos", () => {
    const m = parseClientMetadata(ID, doc({ client_name: "Cl‮aude <b>\n", logo_uri: "http://app.example.com/l.png" }));
    expect(m.name).toBe("Claude b");
    expect(m.logoUri).toBeUndefined();
  });
  it("flags loopback-only redirects", () => {
    expect(loopbackOnly(["http://127.0.0.1:3000/cb", "http://localhost/cb"])).toBe(true);
    expect(loopbackOnly(["http://127.0.0.1:3000/cb", "https://app.example.com/cb"])).toBe(false);
  });
});

describe("HTTP cache lifetime", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("honours Cache-Control and Expires, capped at a day", () => {
    expect(cacheTtl(h({}))).toBe(300);
    expect(cacheTtl(h({ "cache-control": "public, max-age=600" }))).toBe(600);
    expect(cacheTtl(h({ "cache-control": "max-age=999999" }))).toBe(86_400);
    expect(cacheTtl(h({ "cache-control": "no-store" }))).toBe(0);
    expect(cacheTtl(h({ "cache-control": "no-cache, max-age=600" }))).toBe(0);
    expect(cacheTtl(h({ "cache-control": "private, max-age=600" }))).toBe(0);
    expect(cacheTtl(h({ date: "Sun, 08 Nov 2026 10:00:00 GMT", expires: "Sun, 08 Nov 2026 10:02:00 GMT" }))).toBe(120);
    expect(cacheTtl(h({ expires: "0" }))).toBe(0);
  });
});

describe("fetching metadata", () => {
  beforeEach(() => clearCimdCache());

  it("fetches, validates and caches per Cache-Control", async () => {
    const fetcher = vi.fn(async () => json(doc(), { "cache-control": "max-age=60" }));
    const now = Date.parse("2026-11-08T10:00:00Z");
    expect((await resolveClientMetadata(ID, { fetcher, now })).name).toBe("Example MCP");
    await resolveClientMetadata(ID, { fetcher, now: now + 59_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await resolveClientMetadata(ID, { fetcher, now: now + 61_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]).toMatchObject([ID, { headers: { accept: "application/json" } }]);
  });

  it("does not cache no-store documents", async () => {
    const fetcher = vi.fn(async () => json(doc(), { "cache-control": "no-store" }));
    await resolveClientMetadata(ID, { fetcher });
    await resolveClientMetadata(ID, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares one fetch between concurrent requests", async () => {
    const fetcher = vi.fn(async () => json(doc()));
    await Promise.all([resolveClientMetadata(ID, { fetcher }), resolveClientMetadata(ID, { fetcher })]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a redirect", () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/" } }), /redirects are not followed/],
    ["a 404", () => json({}, {}, 404), /HTTP 404/],
    ["HTML", () => new Response("<html>", { headers: { "content-type": "text/html" } }), /application\/json/],
    ["broken JSON", () => json("{nope"), /not valid JSON/],
    ["an oversized body (by header)", () => json(doc(), { "content-length": "999999" }), /too large/],
    ["an oversized body (streamed)", () => json({ ...doc(), pad: "x".repeat(20_000) }), /too large/],
    ["a mismatched client_id", () => json(doc({ client_id: "https://attacker.example/c.json" })), /does not match/],
  ])("refuses %s", async (_, res, why) => {
    await expect(resolveClientMetadata(ID, { fetcher: async () => res() })).rejects.toThrow(why);
  });

  it("remembers failures briefly so a broken client can't make us fetch in a loop", async () => {
    const fetcher = vi.fn(async () => json({}, {}, 500));
    const now = Date.now();
    await expect(resolveClientMetadata(ID, { fetcher, now })).rejects.toThrow(/HTTP 500/);
    await expect(resolveClientMetadata(ID, { fetcher, now: now + 30_000 })).rejects.toThrow(/HTTP 500/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("maps network errors and timeouts to a CimdError", async () => {
    await expect(resolveClientMetadata(ID, { fetcher: async () => { throw new DOMException("timeout", "TimeoutError"); } })).rejects.toBeInstanceOf(CimdError);
  });

  it("never fetches invalid or internal client_ids, and honours the fetch budget", async () => {
    const fetcher = vi.fn(async () => json(doc()));
    await expect(resolveClientMetadata("https://169.254.169.254/latest/meta-data", { fetcher })).rejects.toThrow(/address/);
    await expect(resolveClientMetadata(ID, { fetcher, allowFetch: () => false })).rejects.toThrow(/too many/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("RFC 8707 resource", () => {
  const o = "https://feedback.billiwo.com";
  it("accepts this board's MCP server (and its parents on the same origin)", () => {
    expect(resourceMatches(null, o, "billiwo")).toBe(true);
    expect(resourceMatches(`${o}/billiwo/mcp`, o, "billiwo")).toBe(true);
    expect(resourceMatches("HTTPS://Feedback.Billiwo.com/billiwo/mcp/", o, "billiwo")).toBe(true);
    expect(resourceMatches(`${o}/billiwo`, o, "billiwo")).toBe(true);
    expect(resourceMatches(o, o, "billiwo")).toBe(true);
  });
  it("refuses other servers and other boards", () => {
    expect(resourceMatches(`${o}/apinido/mcp`, o, "billiwo")).toBe(false);
    expect(resourceMatches("https://evil.example/billiwo/mcp", o, "billiwo")).toBe(false);
    expect(resourceMatches(`${o}/billiwo/mcp#x`, o, "billiwo")).toBe(false);
    expect(resourceMatches("not a url", o, "billiwo")).toBe(false);
  });
  it("redirect URIs: https or loopback http, never fragments or credentials", () => {
    expect(validRedirectUri("http://[::1]:8080/cb")).toBe(true);
    expect(validRedirectUri("https://u:p@x.com/cb")).toBe(false);
  });
});
