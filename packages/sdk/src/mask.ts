/**
 * Masking for what the widget captures (network log, action timeline). Runs in the browser BEFORE
 * anything is kept in memory, and again on the Ozvi server as a second line of defence.
 * Dependency-free and small: it ships inside widget.js (20 kB gzip budget).
 */

export const MASK = "***";

/** Names of query parameters, JSON keys and form fields whose values never leave the browser. */
export const SECRET_NAME = /token|secret|passw|pwd|key|auth|session|card|iban|cvv|cvc|otp|pin$|signature|cookie|csrf|xsrf|jwt|bearer|ssn|credential/i;

const JWT = /\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]*/g;
const BEARER = /\b(Bearer|Basic|Token)\s+[\w~+/.=-]{8,}/gi;
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g;
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;

/** Luhn check, so long numbers (timestamps, ids) are not mistaken for card numbers. */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i]!;
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Free text: JWTs, Authorization-style credentials, e-mail addresses, IBANs and card numbers. */
export function maskText(s: string): string {
  return s
    .replace(JWT, MASK)
    .replace(BEARER, (_, kind: string) => `${kind} ${MASK}`)
    .replace(EMAIL, MASK)
    .replace(IBAN, MASK)
    .replace(CARD, (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 13 && d.length <= 19 && luhn(d) ? MASK : m;
    });
}

/** `a=1&token=x` → `a=1&token=***`. Keeps the parameter names (useful for debugging), masks values. */
function maskParams(qs: string): string {
  return qs.split("&").map((pair) => {
    const i = pair.indexOf("=");
    if (i < 0) return maskText(pair);
    let name = pair.slice(0, i);
    try { name = decodeURIComponent(name.replace(/\+/g, " ")); } catch { /* keep raw */ }
    if (SECRET_NAME.test(name)) return `${pair.slice(0, i)}=${MASK}`;
    let v = pair.slice(i + 1);
    try { v = decodeURIComponent(v.replace(/\+/g, " ")); } catch { /* keep raw */ }
    const masked = maskText(v);
    return masked === v ? pair : `${pair.slice(0, i)}=${encodeURIComponent(masked).replace(/%2A/g, "*")}`;
  }).join("&");
}

/**
 * A request or page URL with secrets removed: user:password@ dropped, secret-named query and fragment
 * parameters masked, tokens/e-mails/card numbers in the path or values masked. Relative URLs stay relative.
 */
export function maskUrl(raw: string): string {
  const s = String(raw);
  const m = /^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/s.exec(s);
  if (!m) return maskText(s);
  let [, path = "", query, hash] = m;
  path = path.replace(/^([a-z][\w+.-]*:\/\/)[^/@]*@/i, "$1");
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* keep raw */ }
  // An e-mail or token in the path (`/users/jane@x.com`, `/reset/eyJ…`) is masked even when percent-encoded.
  let out = maskText(decoded) === decoded ? path : maskText(decoded);
  if (query !== undefined) out += `?${maskParams(query)}`;
  if (hash !== undefined) {
    // OAuth implicit flow puts tokens in the fragment: `#access_token=…` or `#/cb?token=…`.
    const q = hash.indexOf("?");
    const [lead, params] = q >= 0 ? [hash.slice(0, q + 1), hash.slice(q + 1)] : /^[!/]*[^=&/]*=/.test(hash) ? ["", hash] : [hash, ""];
    out += `#${maskText(lead)}${params ? maskParams(params) : ""}`;
  }
  return out;
}

function maskValue(v: unknown, depth: number): unknown {
  if (typeof v === "string") return maskText(v);
  if (!v || typeof v !== "object" || depth > 20) return v;
  if (Array.isArray(v)) return v.map((x) => maskValue(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = SECRET_NAME.test(k) && x !== null && x !== "" ? MASK : maskValue(x, depth + 1);
  return out;
}

/**
 * A request or response body: JSON gets secret-named keys masked (at any depth) and secret-looking
 * values masked; a URL-encoded form gets the same per field; anything else is masked as free text.
 * The result is cut to `limit` characters.
 */
export function maskBody(body: string, limit = 2000): string {
  const s = String(body);
  let out: string;
  const t = s.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try { out = JSON.stringify(maskValue(JSON.parse(t), 0)); } catch { out = maskText(s); }
  } else if (/^[\w.%+\-[\]]+=[^\s]*(&[\w.%+\-[\]]+=[^\s]*)*$/.test(t)) {
    out = maskParams(t);
  } else out = maskText(s);
  return out.length > limit ? `${out.slice(0, limit)}…` : out;
}

/**
 * Phone numbers for screenshots: 9–15 digits, optional +/00 prefix, spaces, dashes, dots, slashes
 * or brackets between (dates like "12. 11. 2026" have 8 digits and stay readable).
 */
const PHONE = /(^|[^\w+(])((?:\+|00)?\(?\d[\d ()./-]{7,20}\d)(?!\w)/g;

/**
 * Where a text contains something that must not appear on a screenshot: JWTs, credentials,
 * e-mail addresses, IBANs, card numbers (Luhn-checked) and phone numbers. Sorted, non-overlapping
 * [start, end) ranges; the widget covers them with a solid box in the screenshot's copy of the page.
 */
export function sensitiveRanges(s: string): [number, number][] {
  const found: [number, number][] = [];
  const add = (re: RegExp, ok: (m: string) => boolean = () => true) => {
    for (const m of s.matchAll(re)) if (ok(m[0])) found.push([m.index!, m.index! + m[0].length]);
  };
  add(JWT);
  add(BEARER);
  add(EMAIL);
  add(IBAN);
  add(CARD, (m) => { const d = m.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d); });
  for (const m of s.matchAll(PHONE)) {
    const d = m[2]!.replace(/\D/g, "").length;
    if (d >= 9 && d <= 15) { const at = m.index! + m[1]!.length; found.push([at, at + m[2]!.length]); }
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out: [number, number][] = [];
  for (const r of found) {
    const last = out.at(-1);
    if (last && r[0] < last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}
