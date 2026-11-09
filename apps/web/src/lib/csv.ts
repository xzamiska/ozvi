/**
 * CSV for spreadsheets (export) and for imports (parse). No dependencies, RFC 4180 quoting.
 *
 * Export: UTF-8 with BOM so Excel reads diacritics, `;` or `,` (Slovak and Czech Excel split on `;`),
 * CRLF line ends, and formula-injection protection (OWASP): a cell starting with = + - @ (or tab / CR)
 * gets a leading apostrophe, so a spreadsheet shows it as text instead of evaluating it.
 */

export type Delimiter = ";" | ",";
export type Cell = string | number | boolean | Date | null | undefined;

export const BOM = "\uFEFF";

/** sk/cs Excel expects `;` (decimal comma); English Excel `,`. */
export function delimiterFor(locale: string): Delimiter {
  return locale === "en" ? "," : ";";
}

export function parseDelimiter(v: string | null | undefined, locale: string): Delimiter {
  return v === "comma" || v === "," ? "," : v === "semicolon" || v === ";" ? ";" : delimiterFor(locale);
}

const RISKY = /^[=+\-@\t\r]/;

/** Makes one cell safe for spreadsheets: neutralises formulas, then quotes when needed. */
export function csvCell(v: Cell, delimiter: Delimiter = ","): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : typeof v === "boolean" ? (v ? "1" : "0") : String(v);
  // Numbers are data, not formulas: "-5" from a number column stays a number.
  if (typeof v !== "number" && RISKY.test(s)) s = `'${s}`;
  return s.includes(delimiter) || /["\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][], delimiter: Delimiter = ","): string {
  const line = (r: Cell[]) => r.map((c) => csvCell(c, delimiter)).join(delimiter);
  return BOM + [line(header), ...rows.map(line)].join("\r\n") + "\r\n";
}

/** Picks the delimiter of an uploaded file from its first line (outside quotes). */
export function sniffDelimiter(text: string): ";" | "," | "\t" {
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (d: string) => {
    let n = 0, q = false;
    for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch === d) n++; }
    return n;
  };
  const scores = ([",", ";", "\t"] as const).map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1]);
  return scores[0]![1] > 0 ? scores[0]![0] : ",";
}

/**
 * Parses CSV text (quoted fields with "" escapes, embedded newlines, CRLF/LF, BOM).
 * Returns rows of strings; trailing empty lines are dropped.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const d = delimiter ?? sniffDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { quoted = true; i++; continue; }
    if (ch === d) { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\r" || ch === "\n") {
      row.push(cell); rows.push(row); row = []; cell = "";
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += ch; i++;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  while (rows.length && rows.at(-1)!.every((c) => c.trim() === "")) rows.pop();
  return rows;
}

/** Header + objects keyed by header (duplicate/blank headers get a column number). */
export function parseCsvRecords(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const [head = [], ...body] = parseCsv(text);
  const headers = head.map((h, i) => {
    const name = h.trim() || `#${i + 1}`;
    return head.slice(0, i).some((p) => p.trim() === h.trim()) ? `${name} (${i + 1})` : name;
  });
  const rows = body.filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows };
}

/** Download headers for a CSV attachment (filename ASCII-safe + RFC 5987 for the rest). */
export function csvHeaders(filename: string): HeadersInit {
  const ascii = filename.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "");
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
}
