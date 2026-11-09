import { describe, expect, it } from "vitest";
import { ago, browserLabel, fileSize, initials } from "./format";

describe("format", () => {
  it("formats sizes, initials and browsers", () => {
    expect(fileSize(512)).toBe("512 B");
    expect(fileSize(27_000)).toBe("26 kB");
    expect(fileSize(3_500_000)).toBe("3,3 MB");
    expect(initials("Jana Nováková")).toBe("JN");
    expect(initials(null)).toBe("?");
    expect(initials("Peter (tím)")).toBe("PT");
    expect(browserLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36")).toBe("Chrome 141 · macOS");
  });
  it("relative time", () => {
    const now = Date.UTC(2026, 10, 5, 12);
    expect(ago(new Date(now - 30_000), "sk", now)).toBe("práve teraz");
    expect(ago(new Date(now - 3 * 3600_000), "sk", now)).toBe("pred 3 hodinami");
    expect(ago(new Date(now - 3 * 3600_000), "cs", now)).toBe("před 3 hodinami");
    expect(ago(new Date(now - 3 * 3600_000), "en", now)).toBe("3 hours ago");
    expect(fileSize(3_500_000, "en")).toBe("3.3 MB");
  });
});
