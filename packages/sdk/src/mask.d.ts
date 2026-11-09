/**
 * Masking for what the widget captures (network log, action timeline). Runs in the browser BEFORE
 * anything is kept in memory, and again on the Ozvi server as a second line of defence.
 * Dependency-free and small: it ships inside widget.js (20 kB gzip budget).
 */
export declare const MASK = "***";
/** Names of query parameters, JSON keys and form fields whose values never leave the browser. */
export declare const SECRET_NAME: RegExp;
/** Free text: JWTs, Authorization-style credentials, e-mail addresses, IBANs and card numbers. */
export declare function maskText(s: string): string;
/**
 * A request or page URL with secrets removed: user:password@ dropped, secret-named query and fragment
 * parameters masked, tokens/e-mails/card numbers in the path or values masked. Relative URLs stay relative.
 */
export declare function maskUrl(raw: string): string;
/**
 * A request or response body: JSON gets secret-named keys masked (at any depth) and secret-looking
 * values masked; a URL-encoded form gets the same per field; anything else is masked as free text.
 * The result is cut to `limit` characters.
 */
export declare function maskBody(body: string, limit?: number): string;
