/**
 * Neutralising user text before it leaves Ozvi for places where coding agents read it (GitHub issues).
 * Attacks this defends against (GitLost 2026-07, CSA note 2026-08-07, "ASCII smuggling"):
 * - instructions hidden from human reviewers but read by agents: HTML comments, <details>/hidden HTML,
 *   Markdown link reference definitions (`[//]: # (…)`), zero-width and Unicode tag characters,
 *   variation-selector smuggling, bidi overrides that make text read differently than it runs;
 * - text that triggers agents or people on GitHub by itself: @mentions (e.g. @copilot, @claude).
 * The rule: after this, what an agent reads is what a human sees, and it is quoted under a header
 * that says who wrote it and that it is data, not instructions.
 */

/**
 * Invisible or direction-changing code points: soft hyphen, combining grapheme joiner, Arabic letter mark,
 * Hangul/Mongolian fillers, zero-width space/joiners, LRM/RLM, bidi embeddings/overrides/isolates,
 * word joiner and invisible operators, BOM, interlinear annotations, Unicode tags (E0000–E007F) and
 * supplementary variation selectors (E0100–E01EF).
 */
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ﻿ﾠ￹-￻\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
/** Variation selectors: a lone VS16 after a character is ordinary emoji presentation; runs or others smuggle bits. */
const VARIATION_RUN = /[︀-️]{2,}|[︀-︎]/g;

export function stripInvisible(s: string): string {
  return s.replace(INVISIBLE, "").replace(VARIATION_RUN, "");
}

/** HTML comments, including an unterminated one (it would hide everything after it). */
export function stripHtmlComments(s: string): string {
  return s.replace(/<!--[\s\S]*?(?:--!?>|$)/g, "");
}

/**
 * User Markdown → text safe to embed in a GitHub issue: nothing hidden, no raw HTML, no mentions.
 * The result is still readable Markdown (lists, code, links stay).
 */
export function neutralizeMarkdown(input: string): string {
  // Fenced code shows everything literally on GitHub: only hidden characters go there. Prose gets the full treatment.
  const out: string[] = [];
  let prose: string[] = [];
  let fence: string | null = null;
  const flush = () => { if (prose.length) out.push(neutralizeProse(prose.join("\n"))); prose = []; };
  for (const line of stripInvisible(input.replace(/\r\n?/g, "\n")).split("\n")) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(line);
      if (m && m[1]![0] === fence[0] && m[1]!.length >= fence.length && !line.trim().slice(m[1]!.length).length) fence = null;
    } else if (m) {
      flush();
      fence = m[1]!;
      out.push(line.replace(/</g, "&lt;"));
    } else prose.push(line);
  }
  flush();
  return out.join("\n");
}

function neutralizeProse(input: string): string {
  let s = stripHtmlComments(input);
  // Raw HTML never renders (no <details>, <div hidden>, <img alt>): show it as text instead.
  s = s.replace(/</g, "&lt;");
  // Link reference definitions render as nothing; escape them so they show.
  s = s.replace(/^( {0,3})\[([^\]\n]*)\]:/gm, "$1\\[$2\\]:");
  // @mentions notify people and wake agents (@copilot, @claude): keep them visible but inert in code spans.
  s = s.replace(/(^|[^\w`@/])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9_.-]+)?)/g, "$1`@$2`");
  return s;
}

/** Every line as a Markdown block quote (empty lines too, so the quote never breaks out). */
export function quoteBlock(s: string): string {
  return s.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n");
}

/** A single-line value (title, app version, browser) without hidden characters or line breaks. */
export function neutralizeLine(s: string, max = 300): string {
  return stripInvisible(stripHtmlComments(s)).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
