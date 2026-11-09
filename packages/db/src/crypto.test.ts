import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, newSecret } from "./crypto";

const k = "k".repeat(32);

describe("secret encryption", () => {
  it("round-trips and uses a fresh IV", () => {
    const s = newSecret();
    const e1 = encryptSecret(s, k);
    expect(decryptSecret(e1, k)).toBe(s);
    expect(encryptSecret(s, k)).not.toBe(e1);
  });

  it("fails on wrong key or tampering", () => {
    const e = encryptSecret("hello", k);
    expect(() => decryptSecret(e, "z".repeat(32))).toThrow();
    const parts = e.split(".");
    parts[3] = Buffer.from("hellp").toString("base64url");
    expect(() => decryptSecret(parts.join("."), k)).toThrow();
  });
});
