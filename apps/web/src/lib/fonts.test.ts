import { FONT_CATALOGUE } from "@ozvi/theme";
import { describe, expect, it } from "vitest";
import { familyKey, filesInCss, isWoff2, parseFontQuery, rewriteCss, upstreamCssUrl } from "./fonts";

const catalogue = new Set<string>(FONT_CATALOGUE);
const allowed = (f: string) => catalogue.has(f);
const q = (s: string) => parseFontQuery(new URLSearchParams(s), allowed);

describe("parseFontQuery (allow-list)", () => {
  it("accepts catalogue families with default or explicit weights", () => {
    expect(q("family=Inter")).toEqual({ families: ["Inter"], weights: [400, 500, 600, 700] });
    expect(q("family=IBM+Plex+Sans&family=Inter&family=Inter&wght=700;400,400")).toEqual({ families: ["IBM Plex Sans", "Inter"], weights: [400, 700] });
  });
  it("rejects anything not on the list — it is not an open proxy", () => {
    expect(q("family=Comic+Neue")).toBeNull();
    expect(q("family=Inter&family=Evil")).toBeNull();
    expect(q("")).toBeNull();
    expect(parseFontQuery(new URLSearchParams("family=Comic+Neue"), () => true)).toEqual({ families: ["Comic Neue"], weights: [400, 500, 600, 700] });
  });
  it("sanitises names and weights", () => {
    const any = () => true;
    for (const bad of ["family=../etc", "family=Inter:wght@100", "family=a%0Ab", "family=x</style>", `family=${"a".repeat(61)}`]) {
      expect(parseFontQuery(new URLSearchParams(bad), any), bad).toBeNull();
    }
    expect(q("family=Inter&wght=450")).toBeNull();
    expect(q("family=Inter&wght=1000")).toBeNull();
    expect(q("family=Inter&wght=")).toBeNull();
    expect(q(Array(5).fill("family=Inter").join("&"))).toBeNull();
  });
});

const GOOGLE = `/* latin-ext */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7W0Q5n-wU.woff2) format('woff2');
  unicode-range: U+0100-02BA;
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2) format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-weight: 500;
  src: url('https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2') format('woff2');
}`;

describe("rewriteCss", () => {
  it("points every font file at Ozvi's own origin", () => {
    const out = rewriteCss(GOOGLE)!;
    expect(out.css).not.toContain("gstatic");
    expect(out.css).not.toContain("googleapis");
    expect(out.css).toContain("url(file/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2) format('woff2')");
    expect(out.files).toEqual(["s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7W0Q5n-wU.woff2", "s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2"]);
    expect(filesInCss(out.css)).toHaveLength(3);
  });
  it("refuses CSS with foreign hosts, odd paths or imports", () => {
    expect(rewriteCss(GOOGLE.replace("https://fonts.gstatic.com/s/inter", "https://evil.example/s/inter"))).toBeNull();
    expect(rewriteCss(GOOGLE.replace("s/inter/v20/", "s/../v20/"))).toBeNull();
    expect(rewriteCss(GOOGLE.replace(".woff2)", ".ttf)"))).toBeNull();
    expect(rewriteCss(`@import url(https://fonts.gstatic.com/s/x/v1/a.woff2);${GOOGLE}`)).toBeNull();
    expect(rewriteCss("/* empty */")).toBeNull();
  });
});

describe("helpers", () => {
  it("builds per-family upstream URLs and stable cache keys", () => {
    expect(upstreamCssUrl("IBM Plex Sans", [400, 700])).toBe("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;700&display=swap");
    expect(upstreamCssUrl("Inter", null)).toBe("https://fonts.googleapis.com/css2?family=Inter&display=swap");
    expect(familyKey("IBM Plex Sans", [400, 700])).toBe("ibm-plex-sans_400-700");
  });
  it("recognises woff2 by its signature", () => {
    expect(isWoff2(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0]))).toBe(true);
    expect(isWoff2(new TextEncoder().encode("<html>"))).toBe(false);
  });
});
