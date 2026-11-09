import { onAccent, renderedPalettes, type Theme } from "@ozvi/theme";
import type { Locale } from "../../i18n/locales";
import { translator } from "../../i18n/messages";
import { markdownToText, renderMarkdownWith } from "../markdown";

/** Minimal, themed, table-free e-mail. Inline styles only; every dynamic string is escaped. */

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Mail {
  subject: string;
  /** One line for digests. */
  summary: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
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
  const btn = m.cta
    ? `<p style="margin:24px 0"><a href="${esc(m.cta.href)}" style="display:inline-block;padding:11px 18px;border-radius:${theme.radius}px;background:${c.accent};color:${onAccent(c.accent)};text-decoration:none;font-weight:600">${esc(m.cta.label)}</a></p>`
    : "";
  const quote = m.quote
    ? `<blockquote style="margin:16px 0;padding:10px 14px 2px;border-left:3px solid ${c.accent};background:${c.canvas}">${mailMarkdown(m.quote, theme, { headings: m.quoteHeadings, base: m.quoteBase })}</blockquote>`
    : "";
  const links = m.links && m.links.items.length
    ? `<p style="margin:16px 0 6px;font-weight:600">${esc(m.links.heading)}</p><ul style="margin:0 0 10px;padding-left:20px">${m.links.items.map((l) =>
      `<li style="margin:0 0 4px"><a href="${esc(l.href)}" style="color:${c.ink};text-decoration:underline">${esc(l.label)}</a>${l.note ? ` <span style="color:#666">${esc(l.note)}</span>` : ""}</li>`).join("")}</ul>`
    : "";
  const foot = unsubscribeHref
    ? `<p style="margin-top:32px;font-size:12px;color:#777">${esc(t("footer", { project: projectName }))} <a href="${esc(unsubscribeHref)}" style="color:#777">${esc(t("unsubscribe"))}</a></p>`
    : "";
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:24px 12px;background:${c.canvas};color:${c.ink};font-family:${esc(theme.font.body)},Arial,sans-serif;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:${c.surface};border:1px solid ${c.border};border-radius:${theme.radius}px;padding:24px">
<p style="margin:0 0 12px;font-weight:700">${esc(projectName)}</p>
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${esc(m.heading)}</h1>
${m.paragraphs.map((p) => `<p style="margin:0 0 10px">${esc(p)}</p>`).join("")}${quote}${links}${btn}${foot}
</div></body></html>`;
  const text = [m.heading, "", ...m.paragraphs, m.quote ? `\n${quoteText(m)}` : "",
    m.links && m.links.items.length ? `\n${m.links.heading}\n${m.links.items.map((l) => `- ${l.label}${l.note ? ` ${l.note}` : ""}: ${l.href}`).join("\n")}` : "", m.cta ? `\n${m.cta.label}: ${m.cta.href}` : "",
    unsubscribeHref ? `\n${t("unsubscribe")}: ${unsubscribeHref}` : ""].join("\n");
  return { subject: m.subject, summary: m.summary, html, text };
}

function quoteText(m: Mail) {
  const plain = markdownToText(m.quote!, { headings: m.quoteHeadings, slug: m.quoteBase?.slug, origin: m.quoteBase?.origin, base: m.quoteBase?.origin });
  return plain.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
}
