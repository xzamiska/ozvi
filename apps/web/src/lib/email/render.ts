import { MIX, mixOklab, onAccent, parseTheme, presets, renderedPalettes, type Theme } from "@ozvi/theme";
import type { Locale } from "../../i18n/locales";
import { translator } from "../../i18n/messages";
import { markdownToText, renderMarkdownWith } from "../markdown";
import { publicUrl } from "./url";

/** Themed, table-free e-mail: brand, one card, small print. Inline styles only; every dynamic string is escaped. */

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Ozvi's own e-mails (sign-in to the console, account, usage, updates): the Ozvi preset with the logo as PNG
 * (mail clients do not show SVG), served by this instance, so self-hosted servers send their own copy.
 */
export function ozviMailTheme(): Theme {
  return { ...parseTheme(presets.ozvi), logoUrl: `${publicUrl()}/email/ozvi-logo.png` };
}

/** Gmail and Outlook show no SVG: such a logo would be a broken image, so the mark stands in for it. */
const mailSafeLogo = (url: string | undefined) => !!url && !/\.svg(\?|#|$)/i.test(url) && !/^data:image\/svg/i.test(url);

export interface Mail {
  subject: string;
  /** One line for digests. */
  summary: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  /** Muted line above the button ("Or sign in with one click"). */
  ctaLead?: string;
  /** A one-time code, set large and centred, with a note under it (validity). */
  code?: { value: string; note?: string };
  /** Small print under a divider (why you got this, what to do if it wasn't you). */
  fine?: string[];
  /** Inbox preview text; defaults to the summary. */
  preheader?: string;
  /** User text (Markdown subset), rendered as e-mail-safe HTML and as plain text. */
  quote?: string;
  /** Allow # headings in the quote (changelog entries). */
  quoteHeadings?: boolean;
  /** The board's origin + "/" + slug context: same-site links become absolute, attachment images become links. */
  quoteBase?: { origin: string; slug: string };
  /** A short list of links under the text (proof of a fix: PRs, the release, a preview). Labels are escaped. */
  links?: { heading: string; items: { label: string; href: string; note?: string }[] };
}

/** The Markdown subset as e-mail HTML: inline styles only, images as links (attachments need a sign-in). */
export function mailMarkdown(src: string, theme: Theme, opts: { headings?: boolean; base?: { origin: string; slug: string } } = {}) {
  const c = renderedPalettes(theme).light; // readable even when the host palette is not (WCAG AA)
  const mono = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  return renderMarkdownWith(src, { headings: opts.headings, origin: opts.base?.origin, slug: opts.base?.slug }, {
    base: opts.base?.origin,
    imagesAsLinks: true,
    attrs: {
      p: `style="margin:0 0 8px"`,
      h3: `style="margin:12px 0 6px;font-size:16px;line-height:1.3"`,
      h4: `style="margin:10px 0 6px;font-size:15px;line-height:1.3"`,
      ul: `style="margin:0 0 8px;padding-left:22px"`,
      ol: `style="margin:0 0 8px;padding-left:22px"`,
      li: `style="margin:0 0 2px"`,
      blockquote: `style="margin:0 0 8px;padding-left:10px;border-left:2px solid ${c.border};color:#666"`,
      code: `style="font-family:${mono};font-size:0.92em;background:${c.surface};border:1px solid ${c.border};border-radius:4px;padding:0 3px"`,
      pre: `style="margin:0 0 8px;padding:8px 10px;background:${c.surface};border:1px solid ${c.border};border-radius:6px;font-family:${mono};font-size:13px;white-space:pre-wrap;word-break:break-word"`,
      a: `style="color:${c.ink};text-decoration:underline"`,
    },
  });
}


export function renderMail(m: Mail, theme: Theme, projectName: string, unsubscribeHref: string | null, locale: Locale = "sk") {
  const t = translator(locale, "email");
  const c = renderedPalettes(theme).light; // readable even when the host palette is not (WCAG AA)
  const muted = mixOklab(c.ink, c.surface, MIX.muted);
  const r = Math.min(theme.radius, 16);
  const font = `${esc(theme.font.body)},-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif`;
  const mono = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

  // The project's logo when mail clients can show it (alt text when images are blocked); otherwise a tile with
  // its initial in the accent (like the board's favicon) next to its name.
  const initial = esc((Array.from(projectName.trim())[0] ?? "O").toUpperCase());
  const brand = mailSafeLogo(theme.logoUrl)
    ? `<img src="${esc(theme.logoUrl!)}" alt="${esc(projectName)}" height="28" style="display:block;height:28px;width:auto;border:0">`
    : `<span style="display:inline-block;width:28px;height:28px;line-height:28px;border-radius:${Math.min(r, 8)}px;background:${c.accent};color:${onAccent(c.accent)};text-align:center;font-size:15px;font-weight:700;vertical-align:middle">${initial}</span><span style="display:inline-block;margin-left:10px;font-size:16px;font-weight:700;letter-spacing:-0.01em;vertical-align:middle">${esc(projectName)}</span>`;
  const code = m.code
    ? `<div style="margin:24px 0 8px;padding:20px 12px;background:${c.canvas};border:1px solid ${c.border};border-radius:${r}px;text-align:center">
<div style="font-family:${mono};font-size:34px;line-height:1.1;font-weight:700;letter-spacing:10px;padding-left:10px;color:${c.ink}">${esc(m.code.value)}</div>
${m.code.note ? `<div style="margin-top:8px;font-size:13px;color:${muted}">${esc(m.code.note)}</div>` : ""}</div>`
    : "";
  const btn = m.cta
    ? `${m.ctaLead ? `<p style="margin:24px 0 10px;color:${muted};font-size:14px">${esc(m.ctaLead)}</p>` : ""}<p style="margin:${m.ctaLead ? "0" : "28px"} 0 4px"><a href="${esc(m.cta.href)}" style="display:inline-block;padding:12px 20px;border-radius:${r}px;background:${c.accent};color:${onAccent(c.accent)};text-decoration:none;font-weight:600;font-size:15px">${esc(m.cta.label)}</a></p>`
    : "";
  const quote = m.quote
    ? `<blockquote style="margin:20px 0;padding:12px 16px 4px;border-left:3px solid ${c.accent};background:${c.canvas};border-radius:0 ${r}px ${r}px 0">${mailMarkdown(m.quote, theme, { headings: m.quoteHeadings, base: m.quoteBase })}</blockquote>`
    : "";
  const links = m.links && m.links.items.length
    ? `<p style="margin:20px 0 6px;font-weight:600">${esc(m.links.heading)}</p><ul style="margin:0 0 10px;padding-left:20px">${m.links.items.map((l) =>
      `<li style="margin:0 0 4px"><a href="${esc(l.href)}" style="color:${c.ink};text-decoration:underline">${esc(l.label)}</a>${l.note ? ` <span style="color:${muted}">${esc(l.note)}</span>` : ""}</li>`).join("")}</ul>`
    : "";
  const fine = m.fine?.length
    ? `<div style="margin-top:28px;padding-top:16px;border-top:1px solid ${c.border}">${m.fine.map((f) => `<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${muted}">${esc(f)}</p>`).join("")}</div>`
    : "";
  const foot = unsubscribeHref
    ? `<p style="margin:16px 4px 0;font-size:12px;line-height:1.5;color:${muted}">${esc(t("footer", { project: projectName }))} <a href="${esc(unsubscribeHref)}" style="color:${muted};text-decoration:underline">${esc(t("unsubscribe"))}</a></p>`
    : "";
  const preheader = m.preheader ?? m.summary;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(m.subject)}</title></head>
<body style="margin:0;padding:0;background:${c.canvas};color:${c.ink};font-family:${font};font-size:15px;line-height:1.6;-webkit-text-size-adjust:100%">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>` : ""}
<div style="padding:32px 16px">
<div style="max-width:520px;margin:0 auto">
<div style="margin:0 4px 16px">${brand}</div>
<div style="background:${c.surface};border:1px solid ${c.border};border-radius:${r}px;padding:32px 28px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em">${esc(m.heading)}</h1>
${m.paragraphs.map((p) => `<p style="margin:0 0 12px">${esc(p)}</p>`).join("")}${code}${quote}${links}${btn}${fine}
</div>${foot}
</div></div></body></html>`;
  const text = [m.heading, "", ...m.paragraphs, m.code ? `\n    ${m.code.value}\n${m.code.note ? `\n${m.code.note}` : ""}` : "", m.quote ? `\n${quoteText(m)}` : "",
    m.links && m.links.items.length ? `\n${m.links.heading}\n${m.links.items.map((l) => `- ${l.label}${l.note ? ` ${l.note}` : ""}: ${l.href}`).join("\n")}` : "",
    m.cta ? `\n${m.ctaLead ? `${m.ctaLead}\n` : ""}${m.cta.label}: ${m.cta.href}` : "", m.fine?.length ? `\n${m.fine.join("\n")}` : "",
    unsubscribeHref ? `\n${t("unsubscribe")}: ${unsubscribeHref}` : ""].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { subject: m.subject, summary: m.summary, html, text };
}

function quoteText(m: Mail) {
  const plain = markdownToText(m.quote!, { headings: m.quoteHeadings, slug: m.quoteBase?.slug, origin: m.quoteBase?.origin, base: m.quoteBase?.origin });
  return plain.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
}
