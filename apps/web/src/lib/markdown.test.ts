import { parseTheme, presets } from "@ozvi/theme";
import { describe, expect, it } from "vitest";
import { translator } from "@/i18n/messages";
import { rejectionMail } from "./email/notify";
import { renderMail } from "./email/render";
import { markdownExcerpt, markdownToText, renderMarkdown, safeHref } from "./markdown";

const FILE = "/billiwo/files/0f8b6a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const opts = { slug: "billiwo", origin: "https://feedback.billiwo.sk" };

/** Every tag the renderer may emit; anything else in the output is a bug. */
const ALLOWED = new Set(["p", "br", "strong", "em", "code", "pre", "ul", "ol", "li", "blockquote", "a", "img", "h3", "h4"]);
const ALLOWED_ATTR = new Set(["href", "rel", "target", "src", "alt", "loading", "decoding", "start"]);

function assertSafe(html: string) {
  for (const m of html.matchAll(/<\/?([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*>/gi)) {
    expect(ALLOWED, `tag <${m[1]}> in ${html}`).toContain(m[1]!.toLowerCase());
    for (const a of m[2]!.matchAll(/\s([a-z-]+)(?:="[^"]*")?/gi)) expect(ALLOWED_ATTR, `attribute ${a[1]} in ${html}`).toContain(a[1]!.toLowerCase());
  }
  // Every "<" that is not one of our tags must have been escaped.
  const stripped = html.replace(/<\/?(?:p|br|strong|em|code|pre|ul|ol|li|blockquote|a|img|h3|h4)(?:\s+[a-z-]+(?:="[^"]*")?)*\s*>/gi, "");
  expect(stripped, html).not.toContain("<");
  // Attribute values never contain a raw quote (escaped as &quot;).
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const url = m[1]!.replace(/&amp;/g, "&");
    expect(/^(https?:\/\/|mailto:|\/(?![/\\])|#)/i.test(url), `url ${url}`).toBe(true);
  }
}

const XSS = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg/onload=alert(1)>",
  "<a href=\"javascript:alert(1)\">x</a>",
  "[x](javascript:alert(1))",
  "[x](JaVaScRiPt:alert(1))",
  "[x](java\tscript:alert(1))",
  "[x](java\u0000script:alert(1))",
  "[x]( javascript:alert(1))",
  "[x](vbscript:msgbox(1))",
  "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
  "[x](//evil.example/x)",
  "[x](/\\evil.example)",
  "[x](\\\\evil.example)",
  "[x](&#106;avascript:alert(1))",
  "[x](javascript&colon;alert(1))",
  "[x](https://ok.example\" onmouseover=\"alert(1))",
  "[x](<javascript:alert(1)>)",
  "[x](https://ok.example 'title\" onclick=\"x')",
  "![x](javascript:alert(1))",
  "![x](https://evil.example/pixel.png)",
  "![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)",
  "![x](/other-board/files/0f8b6a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b)",
  `![x" onerror="alert(1)](${FILE})`,
  "**<b onclick=alert(1)>bold</b>**",
  "`<script>alert(1)</script>`",
  "```\n</code></pre><script>alert(1)</script>\n```",
  "> <iframe src=javascript:alert(1)>",
  "- <style>body{display:none}</style>",
  "https://ok.example/\"><script>alert(1)</script>",
  "https://ok.example/<img/src=x/onerror=alert(1)>",
  "javascript:alert(1)",
  "<!-- comment --><x-foo>",
  "[a](https://ok.example)[b](javascript:alert(1))",
  "[[nested](javascript:alert(1))](https://ok.example)",
  "\"><img src=x onerror=alert(1)>",
  "&lt;script&gt;alert(1)&lt;/script&gt;",
  "# <script>alert(1)</script>",
  "[x](mailto:a@b.c?body=<script>)",
];

describe("markdown sanitizer", () => {
  for (const payload of XSS) {
    it(`neutralises ${JSON.stringify(payload).slice(0, 60)}`, () => {
      assertSafe(renderMarkdown(payload, opts));
      assertSafe(renderMarkdown(payload, { ...opts, headings: true }));
    });
  }

  it("shows raw HTML as text", () => {
    expect(renderMarkdown("<b>hi</b> & <i>x</i>")).toBe("<p>&lt;b&gt;hi&lt;/b&gt; &amp; &lt;i&gt;x&lt;/i&gt;</p>");
  });

  it("drops unsafe link targets but keeps their text", () => {
    expect(renderMarkdown("[click](javascript:alert(1))")).toBe("<p>click</p>");
    expect(safeHref("java\nscript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("https://ok.example/a?b=1")).toBe("https://ok.example/a?b=1");
    expect(safeHref("/billiwo/i/3")).toBe("/billiwo/i/3");
  });

  it("links: nofollow ugc noopener everywhere, a new tab only for external ones", () => {
    expect(renderMarkdown("[x](https://other.example)", opts)).toBe('<p><a href="https://other.example" rel="nofollow ugc noopener" target="_blank">x</a></p>');
    expect(renderMarkdown("[x](https://feedback.billiwo.sk/billiwo/i/2)", opts)).toBe('<p><a href="https://feedback.billiwo.sk/billiwo/i/2" rel="nofollow ugc noopener">x</a></p>');
    expect(renderMarkdown("[x](/billiwo/i/2)", opts)).toBe('<p><a href="/billiwo/i/2" rel="nofollow ugc noopener">x</a></p>');
  });

  it("images only from this board's attachments", () => {
    expect(renderMarkdown(`![screen](${FILE})`, opts)).toBe(`<p><img src="${FILE}" alt="screen" loading="lazy" decoding="async"></p>`);
    expect(renderMarkdown(`![screen](https://feedback.billiwo.sk${FILE})`, opts)).toContain(`<img src="${FILE}"`);
    expect(renderMarkdown("![screen](https://evil.example/a.png)", opts)).toBe("<p>screen</p>");
    expect(renderMarkdown(`![screen](${FILE})`)).toBe("<p>screen</p>");
  });

  it("headings only where allowed", () => {
    expect(renderMarkdown("# Nové\n## Opravy")).toBe("<p># Nové<br>## Opravy</p>");
    expect(renderMarkdown("# Nové\n### Opravy", { headings: true })).toBe("<h3>Nové</h3><h4>Opravy</h4>");
  });

  it("deep nesting does not blow the stack", () => {
    assertSafe(renderMarkdown(">".repeat(5000) + " x"));
    assertSafe(renderMarkdown("*".repeat(5000)));
    assertSafe(renderMarkdown("[".repeat(3000) + "x" + "](https://a.example)".repeat(3000)));
    assertSafe(renderMarkdown(Array.from({ length: 200 }, (_, i) => `${"  ".repeat(i)}- x`).join("\n")));
  });

  it("stays fast on hostile input (no quadratic scans)", () => {
    for (const unit of ["*a ", "_a ", "**a ", "[", "[a](", "![", "`a ", "https://a.b/", "*_`[!", "*a _b *c _d "]) {
      const src = unit.repeat(Math.ceil(20_000 / unit.length)).slice(0, 20_000);
      const t = performance.now();
      renderMarkdown(src, { headings: true });
      expect(performance.now() - t, unit).toBeLessThan(250);
    }
  });
});

describe("plain text keeps looking the same", () => {
  const cases: [string, string][] = [
    ["Ahoj, po uložení faktúry zmizne IČ DPH.", "<p>Ahoj, po uložení faktúry zmizne IČ DPH.</p>"],
    ["prvý riadok\ndruhý riadok\ntretí", "<p>prvý riadok<br>druhý riadok<br>tretí</p>"],
    ["odsek 1\n\nodsek 2", "<p>odsek 1</p><p>odsek 2</p>"],
    ["Windows\r\nriadky", "<p>Windows<br>riadky</p>"],
    ["súbor moj_subor_v2.pdf a premenna_s_podciarknikmi", "<p>súbor moj_subor_v2.pdf a premenna_s_podciarknikmi</p>"],
    ["2 * 3 * 4 = 24, a*b", "<p>2 * 3 * 4 = 24, a*b</p>"],
    ["cena < 100 € & > 50 €", "<p>cena &lt; 100 € &amp; &gt; 50 €</p>"],
    ["#12 je duplicita", "<p>#12 je duplicita</p>"],
    ["  odsadené", "<p>  odsadené</p>"],
    ["C:\\Users\\peter", "<p>C:\\Users\\peter</p>"],
    ["", ""],
  ];
  for (const [src, html] of cases) it(JSON.stringify(src).slice(0, 50), () => expect(renderMarkdown(src)).toBe(html));

  it("bare links become links, trailing punctuation stays text", () => {
    expect(renderMarkdown("Pozri https://billiwo.sk/faktury.")).toBe('<p>Pozri <a href="https://billiwo.sk/faktury" rel="nofollow ugc noopener" target="_blank">https://billiwo.sk/faktury</a>.</p>');
    expect(renderMarkdown("(https://a.example/x)")).toContain('href="https://a.example/x"');
  });
});

describe("markdown subset", () => {
  it("renders the supported elements", () => {
    expect(renderMarkdown("**tučné** a _kurzíva_ a `kód`")).toBe("<p><strong>tučné</strong> a <em>kurzíva</em> a <code>kód</code></p>");
    expect(renderMarkdown("- a\n- b\n  - c")).toBe("<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>");
    expect(renderMarkdown("Kroky:\n1. otvor\n2. klikni")).toBe("<p>Kroky:</p><ol><li>otvor</li><li>klikni</li></ol>");
    expect(renderMarkdown("3. tri\n4. štyri")).toBe('<ol start="3"><li>tri</li><li>štyri</li></ol>');
    expect(renderMarkdown("> citát\n> ďalej")).toBe("<blockquote><p>citát<br>ďalej</p></blockquote>");
    expect(renderMarkdown("```js\nconst a = 1 < 2;\n\nx\n```")).toBe("<pre><code>const a = 1 &lt; 2;\n\nx</code></pre>");
  });

  it("plain text and excerpts without Markdown syntax", () => {
    const src = "**Export** do [Pohody](https://pohoda.sk) a `CSV`\n\n- jeden\n- dva\n\n> pozn.";
    expect(markdownToText(src)).toBe("Export do Pohody (https://pohoda.sk) a CSV\n\n- jeden\n- dva\n\n> pozn.");
    expect(markdownToText("[detail](/billiwo/i/3)", { base: "https://x.sk" })).toBe("detail (https://x.sk/billiwo/i/3)");
    expect(markdownExcerpt("**Ahoj**\n\nsvet", 100)).toBe("Ahoj svet");
  });
});

describe("e-mail rendering", () => {
  const theme = parseTheme(presets.ozvi);
  const mail = (quote: string) => renderMail({ subject: "s", summary: "s", heading: "h", paragraphs: ["p"], quote, quoteBase: { origin: "https://x.sk", slug: "billiwo" } },
    theme, "Billiwo", "https://x.sk/unsub", "sk");

  it("renders the subset with inline styles and absolute links; images become links", () => {
    const m = mail(`**Hotovo** v [detaile](/billiwo/i/3)\n\n- a\n- b\n\n![shot](${FILE})`);
    expect(m.html).toContain("<strong>Hotovo</strong>");
    expect(m.html).toMatch(/<a href="https:\/\/x\.sk\/billiwo\/i\/3" rel="nofollow ugc noopener" style="[^"]+">detaile<\/a>/);
    expect(m.html).toMatch(/<ul style="[^"]+"><li style="[^"]+">a<\/li>/);
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain(`href="https://x.sk${FILE}"`);
    expect(m.text).toContain("> Hotovo v detaile (https://x.sk/billiwo/i/3)");
    expect(m.text).toContain("> - a\n> - b");
  });

  it("stays safe", () => {
    const m = mail("<script>alert(1)</script> [x](javascript:alert(1))");
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("javascript:");
    expect(m.html).toContain("&lt;script&gt;");
  });

  it("old plain text keeps its line breaks", () => {
    const m = mail("riadok 1\nriadok 2");
    expect(m.html).toContain("riadok 1<br>riadok 2");
    expect(m.text).toContain("> riadok 1\n> riadok 2");
  });
});

describe("rejection e-mail", () => {
  it("in the author's language, with the team's reason", () => {
    for (const [locale, subject, cta] of [["sk", "Nápad nezverejnený: Tmavý režim", "Otvoriť nápad"], ["cs", "Nápad nezveřejněn: Tmavý režim", "Otevřít nápad"], ["en", "Idea not published: Tmavý režim", "Open the idea"]] as const) {
      const m = renderMail(rejectionMail(translator(locale, "email"), { title: "Tmavý režim" }, "Už riešime v **#12**.", "https://x.sk/billiwo/i/9"),
        parseTheme(presets.ozvi), "Billiwo", "https://x.sk/unsub", locale);
      expect(m.subject).toBe(subject);
      expect(m.html).toContain(cta);
      expect(m.html).toContain("<strong>#12</strong>");
      expect(m.text).toContain("> Už riešime v #12.");
      expect(m.text).toContain("https://x.sk/unsub");
    }
  });

  it("without a reason there is no empty quote", () => {
    const m = rejectionMail(translator("sk", "email"), { title: "X" }, null, "https://x");
    expect(m.quote).toBeUndefined();
    expect(m.paragraphs[0]).toContain("napíšte tímu");
  });
});
