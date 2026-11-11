import { describe, expect, it } from "vitest";
import { checkUrl, expandV6, isPrivateAddress } from "./net";

describe("private IPv6 in every notation", () => {
  it.each([
    "::1", "::", "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:0001", "::ffff:a9fe:a9fe", "::ffff:10.0.0.1",
    "::127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:0:4136:e378::", "fd00::1", "fe80::1%eth0", "ff02::1", "2001:db8::1",
  ])("%s is internal", (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(["2a01:4f8:c17:1::1", "::ffff:8.8.8.8", "2606:4700::1111"])("%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
  it("cloud refuses hex-mapped loopback in a URL", () => {
    expect(checkUrl("https://[::ffff:7f00:1]/hook", "cloud")).not.toBeNull();
    expect(checkUrl("https://[::ffff:127.0.0.1]/hook", "cloud")).not.toBeNull();
  });
  it("expands", () => expect(expandV6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x102, 0x304]));
});
