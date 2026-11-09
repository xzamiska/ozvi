/**
 * Normalised import data: every source (Canny API, Canny CSV, generic CSV) is turned into this shape
 * first, then one engine (engine.ts) previews and writes it. Pure: no DB, safe to unit test.
 *
 * `sid` = the source's own id. Re-running an import skips sids already recorded (import_records),
 * so the same file or Canny account can be imported again without duplicates.
 */

export type Kind = "idea" | "bug";
export type Status = "new" | "confirmed" | "in_progress" | "fixed" | "verified" | "wont_fix" | "open" | "planned" | "shipped" | "declined";

export interface ImportUser {
  sid: string;
  email: string | null;
  name: string | null;
  /** Host-app id when the source knows it (Canny `userID`): the first SSO sign-in then lands on this user. */
  externalId?: string | null;
  traits?: Record<string, string | number>;
  /** Team role from the source (Fider administrator/collaborator). Applied only to people the import creates. */
  role?: "team" | "admin";
  /** The person had unsubscribed from e-mails in the source. */
  emailOptOut?: boolean;
}

export interface ImportItem {
  sid: string;
  kind: Kind;
  title: string;
  body: string;
  status: Status;
  /** Source status name kept when it was not one of ours: matched to a custom sub-status by label. */
  subStatus?: string | null;
  authorSid?: string | null;
  createdAt?: string | null;
  tags: string[];
  /** 1-based source row (CSV) for error messages. */
  row?: number;
  /** Source post number (Fider): kept when that number is still free on the board, so old links map 1:1. */
  number?: number;
  /** Duplicate of another imported item (source id): merged into it, hidden from lists. */
  mergedIntoSid?: string | null;
  /** Waiting for moderation in the source: imported into the team's queue. */
  pending?: boolean;
  updatedAt?: string | null;
}

/** Tag details the source knows (Fider: public or team-only, colour). Without it new tags are team-only. */
export interface ImportTag {
  name: string;
  public: boolean;
  color?: "neutral" | "accent" | "amber" | "green" | "red" | "muted";
}

/**
 * A file on an item (Fider attachments on posts and comments). Only metadata travels in the run's
 * input; the bytes come from a loader held in memory for the run (`ref` = the source's file key).
 */
export interface ImportFile {
  sid: string;
  itemSid: string;
  name: string;
  ref: string;
}

export interface ImportComment {
  sid: string;
  itemSid: string;
  authorSid?: string | null;
  body: string;
  internal: boolean;
  createdAt?: string | null;
}

export interface ImportVote {
  sid: string;
  itemSid: string;
  userSid: string;
  /** 1–3 (importance); clamped to 1 on boards with simple voting. */
  weight: number;
  createdAt?: string | null;
}

/** Problems found while reading the source. `key` is a message in import.errors. */
export interface RowIssue {
  row: number;
  key: "titleMissing" | "titleLong" | "statusUnknown" | "dateInvalid" | "emailInvalid" | "kindUnknown" | "duplicateId" | "bodyLong";
  value?: string;
  /** Errors skip the row; warnings import it with a fallback. */
  level: "error" | "warning";
}

export interface ImportData {
  source: "canny" | "csv" | "fider";
  users: ImportUser[];
  items: ImportItem[];
  comments: ImportComment[];
  votes: ImportVote[];
  issues: RowIssue[];
  tagMeta?: ImportTag[];
  files?: ImportFile[];
  /** Facts the preview should say out loud (e.g. "Canny CSV has no voters"). Keys in import.notes. */
  notes?: { key: string; n?: number }[];
}

export const TITLE_MAX = 200;
export const BODY_MAX = 20_000;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normEmail = (e: string | null | undefined): string | null => {
  const s = (e ?? "").trim().toLowerCase();
  return s && EMAIL.test(s) ? s : null;
};

/** Words → stages. Ozvi keys, our labels in sk/cs/en, Canny's statuses and common tracker words. */
const WORDS: Record<Kind, Record<string, Status>> = {
  idea: {
    open: "open", new: "open", suggested: "open", "under review": "open", review: "open", backlog: "open", idea: "open", requested: "open",
    navrhnute: "open", navrzeno: "open", otvorene: "open", nove: "open",
    planned: "planned", plan: "planned", next: "planned", "up next": "planned", planovane: "planned", planovano: "planned",
    "in progress": "in_progress", in_progress: "in_progress", doing: "in_progress", started: "in_progress", rozpracovane: "in_progress", rozpracovano: "in_progress",
    complete: "shipped", completed: "shipped", done: "shipped", shipped: "shipped", released: "shipped", live: "shipped", launched: "shipped",
    vydane: "shipped", vydano: "shipped", hotove: "shipped", hotovo: "shipped",
    closed: "declined", declined: "declined", rejected: "declined", "won't do": "declined", "wont do": "declined", zamietnute: "declined", zamitnuto: "declined",
  },
  bug: {
    new: "new", open: "new", received: "new", reported: "new", backlog: "new", prijate: "new", prijato: "new", nove: "new",
    confirmed: "confirmed", "under review": "confirmed", triaged: "confirmed", planned: "confirmed", accepted: "confirmed", potvrdene: "confirmed", potvrzeno: "confirmed",
    "in progress": "in_progress", in_progress: "in_progress", doing: "in_progress", rozpracovane: "in_progress", rozpracovano: "in_progress",
    fixed: "fixed", complete: "fixed", completed: "fixed", done: "fixed", resolved: "fixed", opravene: "fixed", opraveno: "fixed",
    verified: "verified", overene: "verified", overeno: "verified",
    closed: "wont_fix", "won't fix": "wont_fix", "wont fix": "wont_fix", wont_fix: "wont_fix", rejected: "wont_fix", declined: "wont_fix",
    "nebudeme riesit": "wont_fix",
  },
};

export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’`]/g, "'").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Source status → our stage. Unknown names fall back to the first stop (open / new) and are kept as
 * `sub` so a custom sub-status with that label can pick them up; `known` tells the preview.
 */
export function mapStatus(kind: Kind, raw: string | null | undefined): { status: Status; sub: string | null; known: boolean } {
  const s = fold(raw ?? "");
  const first: Status = kind === "idea" ? "open" : "new";
  if (!s) return { status: first, sub: null, known: true };
  const hit = WORDS[kind][s] ?? WORDS[kind][s.replace(/ /g, "_")];
  return hit ? { status: hit, sub: null, known: true } : { status: first, sub: (raw ?? "").trim().slice(0, 60), known: false };
}

/** Kind column values: "bug", "chyba", "idea", "nápad", "feature request"… */
export function mapKind(raw: string | null | undefined): Kind | null {
  const s = fold(raw ?? "");
  if (!s) return null;
  if (/^(bugs?|chyb[ay]?|defect|issue|problem)$/.test(s)) return "bug";
  if (/^(ideas?|napad[y]?|feature( request)?s?|request|suggestion|navrh)$/.test(s)) return "idea";
  return null;
}

/** Dates from exports: ISO, "2024-03-01 10:00", "1.3.2024", "1. 3. 2024 10:00", "03/01/2024" (US) or epoch ms. */
export function parseDate(raw: string | null | undefined): string | null | undefined {
  const s = (raw ?? "").trim();
  if (!s) return undefined;
  let d: Date | null = null;
  const sk = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (sk) d = new Date(Date.UTC(+sk[3]!, +sk[2]! - 1, +sk[1]!, +(sk[4] ?? 0), +(sk[5] ?? 0), +(sk[6] ?? 0)));
  else if (us) d = new Date(Date.UTC(+us[3]!, +us[1]! - 1, +us[2]!, +(us[4] ?? 0), +(us[5] ?? 0), +(us[6] ?? 0)));
  else if (/^\d{12,14}$/.test(s)) d = new Date(Number(s));
  else if (/^\d{4}-\d{2}-\d{2}/.test(s)) d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) || s.length <= 10 ? s : `${s.replace(" ", "T")}Z`);
  if (!d || Number.isNaN(+d) || d.getUTCFullYear() < 1990 || +d > Date.now() + 86_400_000) return null;
  return d.toISOString();
}

/** Tag cells: "a, b; c" → ["a", "b", "c"], trimmed, deduped (case-insensitive), max 40 chars, max 20. */
export function splitTags(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of (raw ?? "").split(/[,;|]/)) {
    const t = p.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
  }
  return out.slice(0, 20);
}

/** Canny vote priority (importance) → our weight. */
export function priorityWeight(p: string | null | undefined): number {
  const s = fold(p ?? "");
  return s === "must have" ? 3 : s === "important" ? 2 : 1;
}

/** Placeholder identity for a person known only by e-mail; matches what e-mail sign-in creates. */
export const emailExternalId = (email: string) => `email:${email}`;
