import { afterEach, describe, expect, it } from "vitest";
import { clientIp, resetProxyWarning, warnIfNoProxy } from "./client-ip";

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

  it("warns once when public traffic arrives without a proxy header, never with OZVI_TRUSTED_PROXIES=0", () => {
    const logs: string[] = [];
    const log = (m: string) => logs.push(m);
    resetProxyWarning();
    expect(warnIfNoProxy(h("1.2.3.4"), { OZVI_TRUSTED_PROXIES: "1" }, log)).toBe(false);
    expect(warnIfNoProxy(new Headers(), { OZVI_TRUSTED_PROXIES: "0" }, log)).toBe(false);
    expect(warnIfNoProxy(new Headers(), {}, log)).toBe(true);
    expect(warnIfNoProxy(new Headers(), {}, log)).toBe(false);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("OZVI_TRUSTED_PROXIES=0");
  });
});
