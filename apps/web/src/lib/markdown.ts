/**
 * A small, safe Markdown subset for idea/bug bodies, comments and changelog entries.
 *
 * Pure (no DOM, no dependencies) so the server, the e-mail renderer and the editor preview all
 * produce exactly the same thing. Safety is by construction, not by cleaning: the source is parsed
 * into a tiny tree of known nodes and every text and attribute is escaped on output, so raw HTML
 * in the source is shown as text and never reaches the page.
 *
 * Supported: paragraphs (single line breaks kept, so old plain text looks the same), **bold**,
 * *italic*, `code`, fenced code blocks, - / 1. lists (nested by indentation), > quotes, [links](url),
 * bare https:// links, # headings (only where `headings` is on: changelog) and images, but only of
 * Ozvi attachments of the same board (`/<slug>/files/<uuid>`). Anything else stays literal text.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "em" | "strong"; c: Inline[] }
  | { t: "link"; href: string; external: boolean; c: Inline[] }
  | { t: "img"; src: string; alt: string };

export type Block =
  | { t: "p"; lines: Inline[][] }
  | { t: "h"; level: 3 | 4; c: Inline[] }
  | { t: "pre"; v: string }
  | { t: "quote"; c: Block[] }
  | { t: "list"; ordered: boolean; start: number; items: Block[][] };

export interface MarkdownOptions {
  /** `#` headings (changelog only); elsewhere a leading # is plain text. */
  headings?: boolean;
  /** The board's slug: images are allowed only from `/<slug>/files/<uuid>`. */
  slug?: string;
  /** The board's origin (https://feedback.example.com): links there open in place, same-origin image URLs are accepted. */
  origin?: string;
}

const MAX_DEPTH = 4;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/* ---------------- URLs ---------------- */

/**
 * The only link targets we emit: http(s), mailto, and same-site paths ("/x", "#x").
 * Control characters and whitespace are removed first (browsers ignore them, so "java\tscript:" must not slip by).
 */
export function safeHref(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const url = raw.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!url || url.length > 2000) return null;
  if (/^https?:\/\/[^/?#\\]+/i.test(url)) return url;
  if (/^mailto:[^@\s]+@[^@\s]+$/i.test(url)) return url;
  if (/^\/(?![/\\])/.test(url) || url.startsWith("#")) return url;
  return null;
}

function isExternal(href: string, origin?: string) {
  if (!/^https?:/i.test(href)) return false;
  if (!origin) return true;
  try { return new URL(href).origin !== new URL(origin).origin; } catch { return true; }
}

/** Image src only for this board's attachments; returns the same-site path or null. */
function safeImage(raw: string, opts: MarkdownOptions): string | null {
  if (!opts.slug) return null;
  let src = raw.trim();
  if (opts.origin && src.startsWith(opts.origin + "/")) src = src.slice(opts.origin.length);
  const re = new RegExp(`^/${opts.slug.replace(/[^a-z0-9-]/gi, "")}/files/${UUID}$`, "i");
  return re.test(src) ? src : null;
}

/* ---------------- Inline ---------------- */

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;
const ALNUM = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

function pushText(out: Inline[], v: string) {
  const last = out[out.length - 1];
  if (last?.t === "text") last.v += v;
  else if (v) out.push({ t: "text", v });
}

/** For every `(`, the index of its matching `)` (or -1), honouring escapes. */
function parenPairs(s: string): Int32Array {
  const pairs = new Int32Array(s.length).fill(-1);
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "(") stack.push(i);
    else if (ch === ")" && stack.length) pairs[stack.pop()!] = i;
  }
  return pairs;
}

/**
 * For every `[`, the index of its matching `]` (or -1), honouring nesting, escapes and code spans.
 * One pass up front keeps the parser linear on inputs like "[[[[…".
 */
function bracketPairs(s: string): Int32Array {
  const pairs = new Int32Array(s.length).fill(-1);
  const stack: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "`") { const e = s.indexOf("`", i + 1); if (e > 0) i = e; else break; continue; }
    if (ch === "[") stack.push(i);
    else if (ch === "]" && stack.length) pairs[stack.pop()!] = i;
  }
  return pairs;
}

/** `(url "title")` right after a label: returns the url and the index after `)`. */
function destination(s: string, at: number, parens: Int32Array): { url: string; end: number } | null {
  const close = s[at] === "(" ? parens[at]! : -1;
  if (close < 0) return null;
  let inner = s.slice(at + 1, close).trim();
  const titled = inner.match(/^(\S+)\s+(?:"[^"]*"|'[^']*')$/);
  if (titled) inner = titled[1]!;
  if (inner.startsWith("<") && inner.endsWith(">")) inner = inner.slice(1, -1);
  if (/\s/.test(inner)) return null;
  return { url: inner.replace(/\\(.)/g, "$1"), end: close + 1 };
}

/** Find the closing emphasis delimiter for an opener of `len` × `ch` at `from`. */
function closeEmphasis(s: string, from: number, ch: string, len: number): number {
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") { i++; continue; }
    if (c === "`") { const e = s.indexOf("`", i + 1); if (e > 0) { i = e; continue; } }
    if (c !== ch) continue;
    let run = 0;
    while (s[i + run] === ch) run++;
    const before = s[i - 1] ?? " ";
    const after = s[i + run] ?? " ";
    const fits = len === 1 ? run === 1 || run === 3 : run >= 2;
    if (fits && !SPACE.test(before) && i > from && (ch !== "_" || !ALNUM.test(after))) return i;
    i += run - 1;
  }
  return -1;
}

const URL_START = /^https?:\/\/[^\s<>"'`]/i;

function inline(s: string, opts: MarkdownOptions, inLink = false, depth = 0): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  // Searches that failed once fail for every later start too: remember them (keeps hostile input linear).
  const noCloser = new Map<string, number>();
  const failedFrom = (key: string, from: number) => from >= (noCloser.get(key) ?? Infinity);
  const failed = (key: string, from: number) => noCloser.set(key, Math.min(from, noCloser.get(key) ?? Infinity));
  let pairs: Int32Array | null = null;
  let parens: Int32Array | null = null;
  while (i < s.length) {
    const ch = s[i]!;
    // Backslash escapes for punctuation.
    if (ch === "\\" && i + 1 < s.length && PUNCT.test(s[i + 1]!)) { pushText(out, s[i + 1]!); i += 2; continue; }
    // Code spans: same-length backtick runs.
    if (ch === "`") {
      let run = 0;
      while (s[i + run] === "`") run++;
      const fence = "`".repeat(run);
      let j = failedFrom(`\`${run}`, i + run) ? -1 : s.indexOf(fence, i + run);
      while (j > 0 && s[j + run] === "`") j = s.indexOf(fence, j + run + 1);
      if (j < 0) failed(`\`${run}`, i + run);
      if (j > 0) {
        let v = s.slice(i + run, j);
        if (v.length > 2 && v.startsWith(" ") && v.endsWith(" ")) v = v.slice(1, -1);
        out.push({ t: "code", v });
        i = j + run;
        continue;
      }
      pushText(out, fence);
      i += run;
      continue;
    }
    // Images and links.
    if ((ch === "!" && s[i + 1] === "[") || ch === "[") {
      const img = ch === "!";
      const open = img ? i + 1 : i;
      pairs ??= bracketPairs(s);
      const close = pairs[open]!;
      const dest = close > 0 ? destination(s, close + 1, (parens ??= parenPairs(s))) : null;
      if (dest && depth < MAX_DEPTH) {
        const label = s.slice(open + 1, close);
        if (img) {
          const src = safeImage(dest.url, opts);
          const alt = label.replace(/\\(.)/g, "$1");
          if (src) out.push({ t: "img", src, alt });
          else pushText(out, alt);
          i = dest.end;
          continue;
        }
        const href = inLink ? null : safeHref(dest.url);
        const c = inline(label, opts, true, depth + 1);
        if (href) out.push({ t: "link", href, external: isExternal(href, opts.origin), c });
        else for (const n of c) n.t === "text" ? pushText(out, n.v) : out.push(n);
        i = dest.end;
        continue;
      }
    }
    // Bare links.
    if (!inLink && (ch === "h" || ch === "H") && URL_START.test(s.slice(i, i + 10)) && !ALNUM.test(s[i - 1] ?? " ")) {
      let j = i;
      while (j < s.length && !/[\s<>"`]/.test(s[j]!)) j++;
      let end = j;
      let open = 0, close = 0;
      for (let k = i; k < j; k++) { if (s[k] === "(") open++; else if (s[k] === ")") close++; }
      // Trailing punctuation belongs to the sentence; a ")" only when unbalanced.
      for (;;) {
        const last = s[end - 1];
        if (last && /[.,;:!?'*_]/.test(last)) end--;
        else if (last === ")" && open < close) { end--; close--; }
        else break;
      }
      const url = s.slice(i, end);
      const href = safeHref(url);
      if (href && url.length > 8) {
        out.push({ t: "link", href, external: isExternal(href, opts.origin), c: [{ t: "text", v: url }] });
        i = end;
        continue;
      }
      // Not a usable link (too long…): the whole token is text, never rescanned.
      pushText(out, s.slice(i, j));
      i = j;
      continue;
    }
    // Emphasis: ** / __ strong, * / _ em.
    if ((ch === "*" || ch === "_") && depth < MAX_DEPTH) {
      let run = 0;
      while (s[i + run] === ch) run++;
      const next = s[i + run] ?? " ";
      const prev = s[i - 1] ?? " ";
      const canOpen = !SPACE.test(next) && (ch !== "_" || !ALNUM.test(prev));
      if (canOpen && run <= 3) {
        const len = run >= 2 ? 2 : 1;
        const key = ch + len;
        const close = failedFrom(key, i + len) ? -1 : closeEmphasis(s, i + len, ch, len);
        if (close < 0) failed(key, i + len);
        if (close > 0) {
          const c = inline(s.slice(i + len, close), opts, inLink, depth + 1);
          out.push({ t: len === 2 ? "strong" : "em", c });
          i = close + len;
          continue;
        }
      }
      pushText(out, ch.repeat(run));
      i += run;
      continue;
    }
    pushText(out, ch);
    i++;
  }
  return out;
}

/* ---------------- Blocks ---------------- */

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const blank = (l: string) => l.trim() === "";
const indentOf = (l: string) => l.match(/^ */)![0].length;

function parseBlocks(lines: string[], opts: MarkdownOptions, depth: number): Block[] {
  const out: Block[] = [];
  let i = 0;
  const startsBlock = (l: string) => FENCE.test(l) || (depth < MAX_DEPTH && (QUOTE.test(l) || ITEM.test(l))) || (opts.headings && HEADING.test(l));
  while (i < lines.length) {
    const line = lines[i]!;
    if (blank(line)) { i++; continue; }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1]!;
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[i]!)) body.push(lines[i++]!);
      i++;
      out.push({ t: "pre", v: body.join("\n") });
      continue;
    }

    const heading = opts.headings ? line.match(HEADING) : null;
    if (heading) {
      out.push({ t: "h", level: heading[1]!.length <= 2 ? 3 : 4, c: inline(heading[2]!, opts) });
      i++;
      continue;
    }

    if (depth < MAX_DEPTH && QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) inner.push(lines[i++]!.match(QUOTE)![1]!);
      out.push({ t: "quote", c: parseBlocks(inner, opts, depth + 1) });
      continue;
    }

    const first = depth < MAX_DEPTH ? line.match(ITEM) : null;
    if (first) {
      const ordered = /\d/.test(first[2]!);
      const kind = ordered ? first[2]!.slice(-1) : first[2]!;
      const items: Block[][] = [];
      while (i < lines.length) {
        const m = lines[i]!.match(ITEM);
        if (!m || (ordered ? !/\d/.test(m[2]!) || m[2]!.slice(-1) !== kind : m[2] !== kind) || m[1]!.length > indentOf(line)) break;
        const contentIndent = m[1]!.length + m[2]!.length + Math.min(m[3]!.length, 4);
        const body = [m[4]!];
        i++;
        // Continuation: indented lines (nested lists, more text), blank lines inside an item that goes on.
        while (i < lines.length) {
          const l = lines[i]!;
          if (blank(l)) {
            const nx = lines[i + 1];
            if (nx !== undefined && !blank(nx) && indentOf(nx) >= Math.min(contentIndent, 2) && !(ITEM.test(nx) && indentOf(nx) <= m[1]!.length)) { body.push(""); i++; continue; }
            break;
          }
          if (indentOf(l) >= 2 && indentOf(l) > m[1]!.length) { body.push(l.slice(Math.min(indentOf(l), contentIndent))); i++; continue; }
          if (ITEM.test(l) || startsBlock(l)) break;
          body.push(l); // lazy continuation of the item's paragraph
          i++;
        }
        items.push(parseBlocks(body, opts, depth + 1));
        // A blank line between items keeps the list going.
        if (blank(lines[i] ?? "x") && ITEM.test(lines[i + 1] ?? "")) i++;
      }
      out.push({ t: "list", ordered, start: ordered ? Math.min(Number.parseInt(first[2]!, 10), 1e9) : 1, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && !blank(lines[i]!) && (para.length === 0 || !startsBlock(lines[i]!))) para.push(lines[i++]!);
    out.push({ t: "p", lines: para.map((l) => inline(l.replace(/\s+$/, ""), opts)) });
  }
  return out;
}

export function parseMarkdown(src: string, opts: MarkdownOptions = {}): Block[] {
  const lines = (src ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  return parseBlocks(lines, opts, 0);
}

/* ---------------- Output ---------------- */

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Extra attributes per tag (the e-mail renderer passes inline styles); values are trusted constants. */
type Attrs = Partial<Record<"p" | "h3" | "h4" | "pre" | "code" | "blockquote" | "ul" | "ol" | "li" | "a" | "img" | "strong" | "em", string>>;

interface HtmlOut {
  attrs?: Attrs;
  /** Make same-site links absolute (e-mail). */
  base?: string;
  /** Show images as links (e-mail clients cannot load signed-in attachments). */
  imagesAsLinks?: boolean;
}

const LINK_REL = "nofollow ugc noopener";

function inlineHtml(nodes: Inline[], o: HtmlOut): string {
  const a = (tag: keyof Attrs) => (o.attrs?.[tag] ? ` ${o.attrs[tag]}` : "");
  const abs = (href: string) => (o.base && href.startsWith("/") ? o.base + href : href);
  return nodes.map((n) => {
    switch (n.t) {
      case "text": return escapeHtml(n.v);
      case "code": return `<code${a("code")}>${escapeHtml(n.v)}</code>`;
      case "strong": return `<strong${a("strong")}>${inlineHtml(n.c, o)}</strong>`;
      case "em": return `<em${a("em")}>${inlineHtml(n.c, o)}</em>`;
      case "link":
        return `<a href="${escapeHtml(abs(n.href))}" rel="${LINK_REL}"${n.external ? ` target="_blank"` : ""}${a("a")}>${inlineHtml(n.c, o)}</a>`;
      case "img":
        return o.imagesAsLinks
          ? `<a href="${escapeHtml(abs(n.src))}" rel="${LINK_REL}"${a("a")}>${escapeHtml(n.alt || n.src.split("/").pop()!)}</a>`
          : `<img src="${escapeHtml(n.src)}" alt="${escapeHtml(n.alt)}" loading="lazy" decoding="async"${a("img")}>`;
    }
  }).join("");
}

function blocksHtml(blocks: Block[], o: HtmlOut, tight = false): string {
  const a = (tag: keyof Attrs) => (o.attrs?.[tag] ? ` ${o.attrs[tag]}` : "");
  return blocks.map((b) => {
    switch (b.t) {
      case "p": {
        const inner = b.lines.map((l) => inlineHtml(l, o)).join("<br>");
        return tight ? inner : `<p${a("p")}>${inner}</p>`;
      }
      case "h": return `<h${b.level}${a(b.level === 3 ? "h3" : "h4")}>${inlineHtml(b.c, o)}</h${b.level}>`;
      case "pre": return `<pre${a("pre")}><code>${escapeHtml(b.v)}</code></pre>`;
      case "quote": return `<blockquote${a("blockquote")}>${blocksHtml(b.c, o)}</blockquote>`;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        const start = b.ordered && b.start !== 1 ? ` start="${b.start}"` : "";
        // Tight items (one paragraph, maybe a nested list) render without <p>.
        const items = b.items.map((it) => `<li${a("li")}>${blocksHtml(it, o, it.filter((x) => x.t === "p").length <= 1)}</li>`).join("");
        return `<${tag}${start}${a(tag)}>${items}</${tag}>`;
      }
    }
  }).join("");
}

/** Safe HTML for the board (wrap it in an element with class `oz-md`). */
export function renderMarkdown(src: string, opts: MarkdownOptions = {}): string {
  return blocksHtml(parseMarkdown(src, opts), {});
}

/** Safe HTML with the given per-tag attributes (inline styles for e-mail), same-site links made absolute. */
export function renderMarkdownWith(src: string, opts: MarkdownOptions, out: HtmlOut): string {
  return blocksHtml(parseMarkdown(src, opts), out);
}

/* ---------------- Plain text ---------------- */

function inlineText(nodes: Inline[], base?: string): string {
  return nodes.map((n) => {
    switch (n.t) {
      case "text": case "code": return n.v;
      case "strong": case "em": return inlineText(n.c, base);
      case "img": return n.alt ? `[${n.alt}]` : "";
      case "link": {
        const label = inlineText(n.c, base);
        const href = base && n.href.startsWith("/") ? base + n.href : n.href;
        return label === n.href || label === href || href.startsWith("#") ? label : `${label} (${href.replace(/^mailto:/i, "")})`;
      }
    }
  }).join("");
}

function blocksText(blocks: Block[], base?: string, sep = "\n\n"): string {
  return blocks.map((b) => {
    switch (b.t) {
      case "p": return b.lines.map((l) => inlineText(l, base)).join("\n");
      case "h": return inlineText(b.c, base);
      case "pre": return b.v;
      case "quote": return blocksText(b.c, base).split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
      case "list":
        return b.items.map((it, k) => {
          const mark = b.ordered ? `${b.start + k}. ` : "- ";
          const body = blocksText(it, base, "\n").split("\n");
          return mark + body.map((l, j) => (j === 0 || !l ? l : " ".repeat(mark.length) + l)).join("\n");
        }).join("\n");
    }
  }).join(sep);
}

/** Plain text without Markdown syntax (webhooks, Slack, e-mail text part, list previews). */
export function markdownToText(src: string, opts: MarkdownOptions & { base?: string } = {}): string {
  return blocksText(parseMarkdown(src, opts), opts.base);
}

/** One line for list previews (no line breaks). */
export function markdownExcerpt(src: string, max = 240): string {
  const one = markdownToText(src).replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}
