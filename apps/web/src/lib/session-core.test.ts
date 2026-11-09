import { beforeAll, describe, expect, it } from "vitest";
import { decodeSession, encodeSession, safeReturn } from "./session-core";

beforeAll(() => { process.env.OZVI_SESSION_SECRET = "t".repeat(32); });

describe("session cookie", () => {
  const s = { u: "user", p: "proj", exp: Math.floor(Date.now() / 1000) + 60 };

  it("round-trips", () => expect(decodeSession(encodeSession(s))).toEqual(s));

  it("rejects tampering, expiry and garbage", () => {
    const [, sig] = encodeSession(s).split(".");
    const forged = Buffer.from(JSON.stringify({ ...s, u: "admin" })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`)).toBeNull();
    expect(decodeSession(encodeSession({ ...s, exp: 1 }))).toBeNull();
    expect(decodeSession("x")).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
  });
});

describe("safeReturn", () => {
  it.each([
    ["/billiwo/i/4", "/billiwo/i/4"],
    ["//evil.com/billiwo/", "/billiwo/ideas"],
    ["https://evil.com", "/billiwo/ideas"],
    ["/apinido/ideas", "/billiwo/ideas"],
    ["/billiwo/\\evil.com", "/billiwo/ideas"],
    [null, "/billiwo/ideas"],
  ])("%s → %s", (input, out) => expect(safeReturn("billiwo", input)).toBe(out));
});
