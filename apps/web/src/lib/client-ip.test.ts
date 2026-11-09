import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const h = (xff: string) => new Headers({ "x-forwarded-for": xff });
afterEach(() => { delete process.env.OZVI_TRUSTED_PROXIES; });

describe("clientIp", () => {
  it("ignores client-supplied entries in front of the proxy", () => {
    expect(clientIp(h("6.6.6.6, 1.2.3.4"))).toBe("1.2.3.4");
    process.env.OZVI_TRUSTED_PROXIES = "2";
    expect(clientIp(h("6.6.6.6, 1.2.3.4, 10.0.0.1"))).toBe("1.2.3.4");
    process.env.OZVI_TRUSTED_PROXIES = "0";
    expect(clientIp(h("6.6.6.6"))).toBe("direct");
  });
});
