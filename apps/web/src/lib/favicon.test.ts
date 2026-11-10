import { describe, expect, it } from "vitest";
import { appSite, iconLinks, iconType, letterIcon } from "./favicon";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("iconType", () => {
  it("knows icons by their bytes", () => {
    expect(iconType(new Uint8Array([0, 0, 1, 0, 1, 0]))).toBe("image/x-icon");
    expect(iconType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe("image/png");
    expect(iconType(bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe("image/svg+xml");
    expect(iconType(bytes("<!-- logo --><svg viewBox='0 0 1 1'/>"))).toBe("image/svg+xml");
  });
  it("refuses pages and other files that only claim to be icons", () => {
    expect(iconType(bytes("<!doctype html><html><body>404</body></html>"))).toBeNull();
    expect(iconType(bytes("%PDF-1.7"))).toBeNull();
    expect(iconType(bytes("just text"))).toBeNull();
  });
});

describe("iconLinks", () => {
  const html = `<head>
    <link rel="stylesheet" href="/a.css">
    <link rel="apple-touch-icon" href="/apple.png" sizes="180x180">
    <link rel='icon' type='image/png' sizes='16x16' href='/16.png'>
    <link rel=icon type=image/png sizes=32x32 href=/32.png>
    <link rel="icon" href="data:image/png;base64,AAA">
    <link href="https://cdn.example.com/logo.svg" rel="icon" type="image/svg+xml">
  </head>`;
  it("ranks SVG first, then the largest PNG, then the touch icon; resolves relative URLs", () => {
    expect(iconLinks(html, "https://app.example.com/sk/").map((c) => c.href)).toEqual([
      "https://cdn.example.com/logo.svg", "https://app.example.com/32.png", "https://app.example.com/16.png", "https://app.example.com/apple.png",
    ]);
  });
  it("skips data: URLs and non-http schemes", () => {
    expect(iconLinks(`<link rel="icon" href="javascript:alert(1)"><link rel="icon" href="data:x">`, "https://a.sk/")).toEqual([]);
  });
});

describe("appSite", () => {
  it("takes the login URL's site, else the first allowed origin", () => {
    expect(appSite({ loginUrl: "https://app.billiwo.com/ozvi/login?x=1", allowedOrigins: ["https://other.sk"] })).toBe("https://app.billiwo.com/");
    expect(appSite({ loginUrl: null, allowedOrigins: ["https://app.apinido.sk"] })).toBe("https://app.apinido.sk/");
    expect(appSite({ loginUrl: null, allowedOrigins: [] })).toBeNull();
  });
});

describe("letterIcon", () => {
  it("draws the first letter, escaped, in the accent colour", () => {
    const svg = letterIcon("  žltá ruža", "#1D4ED8", "#FFFFFF");
    expect(svg).toContain(">Ž</text>");
    expect(svg).toContain('fill="#1D4ED8"');
    expect(letterIcon("<b>", "#000000", "#FFFFFF")).toContain(">B</text>");
  });
});
