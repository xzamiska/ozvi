import { describe, expect, it } from "vitest";
import { safeName, sniff } from "./storage";

describe("sniff", () => {
  it("detects by magic bytes", () => {
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe("image/png");
    expect(sniff(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe("application/pdf");
    expect(sniff(new TextEncoder().encode("ERROR at line 4"))).toBe("text/plain");
  });
  it("rejects binaries and HTML pretending to be images still count as text (served as attachment)", () => {
    expect(sniff(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // exe
    expect(sniff(new TextEncoder().encode("<script>alert(1)</script>"))).toBe("text/plain");
  });
});

describe("safeName", () => {
  it("strips paths and odd characters", () => {
    expect(safeName("../../etc/passwd")).toBe("....etcpasswd");
    expect(safeName("Snímka obrazovky 2026.png")).toBe("Snimka-obrazovky-2026.png");
    expect(safeName("???")).toBe("subor");
  });
});
