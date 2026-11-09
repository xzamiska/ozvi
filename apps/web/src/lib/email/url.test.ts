import { afterEach, describe, expect, it } from "vitest";
import { appOrigin } from "./url";

afterEach(() => { delete process.env.PUBLIC_URL; });

describe("appOrigin", () => {
  it("prefers PUBLIC_URL over the proxied request origin", () => {
    process.env.PUBLIC_URL = "https://feedback.example.com/";
    expect(appOrigin("https://0.0.0.0:3000")).toBe("https://feedback.example.com");
  });
  it("falls back to the request origin", () => {
    expect(appOrigin("http://localhost:3300")).toBe("http://localhost:3300");
  });
});
