import { createHash } from "node:crypto";
import { parseCsvRecords } from "../csv";
import {
  BODY_MAX, emailExternalId, fold, mapKind, mapStatus, normEmail, parseDate, splitTags, TITLE_MAX,
  type ImportData, type ImportItem, type ImportUser, type ImportVote, type Kind, type RowIssue,
} from "./model";

/**
 * Generic CSV → ImportData through a column mapping the admin confirms. Canny's CSV post export is
 * recognised by its headers and gets a ready mapping (it carries vote totals but no voters or
 * comments; the preview says so and points to the API import).
 */

export const CSV_FIELDS = ["id", "title", "body", "kind", "status", "authorEmail", "authorName", "createdAt", "tags", "voterEmails", "links"] as const;
export type CsvField = (typeof CSV_FIELDS)[number];
export type Mapping = Partial<Record<CsvField, string>>;

/** Header names we recognise per field (folded: lower case, no diacritics). First match wins. */
const GUESS: Record<CsvField, string[]> = {
  id: ["id", "post url", "url", "source id", "external id", "key", "cislo", "number", "#"],
  title: ["title", "post title", "nazov", "nazev", "subject", "name", "summary", "titulok"],
  body: ["body", "post detail", "description", "details", "detail", "popis", "text", "content", "obsah"],
  kind: ["kind", "type", "typ", "druh", "board"],
  status: ["status", "post status", "stav", "stage", "state"],
  authorEmail: ["author email", "email", "e-mail", "author e-mail", "reporter email", "user email"],
  authorName: ["author", "post author", "author name", "autor", "meno", "jmeno", "name of author", "reporter", "user"],
  createdAt: ["created", "date created", "created at", "created_at", "date", "datum", "vytvorene", "vytvoreno"],
  tags: ["tags", "tag", "labels", "stitky", "stitky", "labels/tags"],
  voterEmails: ["voters", "voter emails", "voter e-mails", "hlasujuci", "hlasujici"],
  links: ["image urls", "images", "attachments", "prilohy", "links"],
};

export function isCannyCsv(headers: string[]): boolean {
  const h = new Set(headers.map(fold));
  return h.has("post title") && (h.has("score (total votes)") || h.has("post status"));
}

export function guessMapping(headers: string[]): Mapping {
  const folded = headers.map((h) => [h, fold(h)] as const);
  const used = new Set<string>();
  const m: Mapping = {};
  for (const field of CSV_FIELDS) {
    for (const g of GUESS[field]) {
      const hit = folded.find(([h, f]) => f === fold(g) && !used.has(h));
      if (hit) { m[field] = hit[0]; used.add(hit[0]); break; }
    }
  }
  return m;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

export interface CsvOptions { mapping: Mapping; defaultKind: Kind }

/** Reads rows with the mapping. Row numbers are 1-based spreadsheet rows (header = row 1). */
export function csvToImport(text: string, opts: CsvOptions): ImportData & { headers: string[]; canny: boolean } {
  const { headers, rows } = parseCsvRecords(text);
  const canny = isCannyCsv(headers);
  const m = opts.mapping;
  const get = (r: Record<string, string>, f: CsvField) => (m[f] ? (r[m[f]!] ?? "").trim() : "");
  const users = new Map<string, ImportUser>();
  const items: ImportItem[] = [];
  const votes: ImportVote[] = [];
  const issues: RowIssue[] = [];
  const seenIds = new Set<string>();
  let lostVotes = 0;

  const person = (email: string | null, name: string | null): string | null => {
    if (!email) return null;
    const sid = `email:${email}`;
    const prev = users.get(sid);
    if (!prev) users.set(sid, { sid, email, name, externalId: emailExternalId(email) });
    else if (!prev.name && name) prev.name = name;
    return sid;
  };

  rows.forEach((r, i) => {
    const row = i + 2;
    const title = get(r, "title").replace(/\s+/g, " ");
    if (!title) { issues.push({ row, key: "titleMissing", level: "error" }); return; }
    if (title.length > TITLE_MAX) { issues.push({ row, key: "titleLong", value: `${title.length}`, level: "error" }); return; }
    const kindRaw = get(r, "kind");
    let kind = opts.defaultKind;
    if (kindRaw) {
      const k = mapKind(kindRaw);
      if (k) kind = k; else issues.push({ row, key: "kindUnknown", value: kindRaw.slice(0, 60), level: "warning" });
    }
    const st = mapStatus(kind, get(r, "status"));
    if (!st.known) issues.push({ row, key: "statusUnknown", value: st.sub ?? "", level: "warning" });
    const createdRaw = get(r, "createdAt");
    const createdAt = parseDate(createdRaw);
    if (createdAt === null) issues.push({ row, key: "dateInvalid", value: createdRaw.slice(0, 40), level: "warning" });

    // Author: an e-mail column, or a name column that holds an address (Canny's "Post Author" can be either).
    const emailRaw = get(r, "authorEmail");
    const nameRaw = get(r, "authorName");
    let email = normEmail(emailRaw);
    let name = nameRaw || null;
    if (!email && name && normEmail(name)) { email = normEmail(name); name = null; }
    if (emailRaw && !email) issues.push({ row, key: "emailInvalid", value: emailRaw.slice(0, 80), level: "warning" });
    const authorSid = person(email, name?.slice(0, 120) ?? null);

    let body = get(r, "body");
    const links = get(r, "links").split(/[\s,;]+/).filter((u) => /^https?:\/\/\S+$/i.test(u));
    if (links.length) body = `${body}${body ? "\n\n" : ""}${links.join("\n")}`;
    if (body.length > BODY_MAX) { issues.push({ row, key: "bodyLong", value: `${body.length}`, level: "warning" }); body = body.slice(0, BODY_MAX); }

    const idRaw = get(r, "id");
    const sid = idRaw ? `id:${idRaw.slice(0, 300)}` : `row:${hash([kind, fold(title), createdAt ?? "", email ?? ""].join("|"))}`;
    if (seenIds.has(sid)) { issues.push({ row, key: "duplicateId", value: idRaw.slice(0, 80) || title.slice(0, 80), level: "error" }); return; }
    seenIds.add(sid);

    items.push({ sid, kind, title, body, status: st.status, subStatus: st.sub, authorSid, createdAt: createdAt ?? null, tags: splitTags(get(r, "tags")), row });

    for (const v of get(r, "voterEmails").split(/[\s,;]+/).filter(Boolean)) {
      const ve = normEmail(v);
      if (!ve) { issues.push({ row, key: "emailInvalid", value: v.slice(0, 80), level: "warning" }); continue; }
      const userSid = person(ve, null)!;
      if (kind === "idea") votes.push({ sid: `${sid}|${userSid}`, itemSid: sid, userSid, weight: 1 });
    }
    if (canny) lostVotes += Number(r["Score (Total Votes)"] ?? 0) || 0;
  });

  // One vote per person per item even if a cell lists an address twice.
  const uniq = [...new Map(votes.map((v) => [v.sid, v])).values()];
  return {
    source: canny ? "canny" : "csv", headers, canny, users: [...users.values()], items, comments: [], votes: uniq, issues,
    notes: canny && !m.voterEmails ? [{ key: "cannyCsvNoVoters", n: lostVotes }] : [],
  };
}
