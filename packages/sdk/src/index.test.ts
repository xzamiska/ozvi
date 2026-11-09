import { describe, expect, it } from "vitest";
import { OzviTokenError, signOzviToken, verifyOzviToken } from "./index";

const secret = "s".repeat(32);
const t0 = Date.UTC(2026, 10, 5);
const now = () => t0;

describe("sso token", () => {
  it("round-trips user and traits", () => {
    const token = signOzviToken({ id: "u1", email: "m@x.sk", traits: { plan: "pro", mrr: 2900 } }, secret, { now });
    const c = verifyOzviToken(token, secret, { now });
    expect(c).toMatchObject({ id: "u1", email: "m@x.sk", traits: { plan: "pro", mrr: 2900 }, exp: t0 / 1000 + 600 });
  });

  it("carries the user's locale", () => {
    const c = verifyOzviToken(signOzviToken({ id: "u1", locale: "cs" }, secret, { now }), secret, { now });
    expect(c.locale).toBe("cs");
  });

  it("rejects wrong secret, tampering, expiry and alg none", () => {
    const token = signOzviToken({ id: "u1" }, secret, { now });
    const reason = (fn: () => unknown) => {
      try { fn(); } catch (e) { return (e as OzviTokenError).reason; }
      return "ok";
    };
    expect(reason(() => verifyOzviToken(token, "x".repeat(32), { now }))).toBe("signature");
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ id: "admin", exp: 9e9 })).toString("base64url");
    expect(reason(() => verifyOzviToken(`${h}.${forged}.${s}`, secret, { now }))).toBe("signature");
    expect(reason(() => verifyOzviToken(token, secret, { now: () => t0 + 700_000 }))).toBe("expired");
    const none = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    expect(reason(() => verifyOzviToken(`${none}.${token.split(".")[1]}.`, secret, { now }))).toBe("algorithm");
    expect(reason(() => verifyOzviToken("nope", secret))).toBe("malformed");
  });

  it("refuses short secrets and missing id", () => {
    expect(() => signOzviToken({ id: "u1" }, "short")).toThrow(/32/);
    expect(() => signOzviToken({ id: "" }, secret)).toThrow(/id/);
  });
});
