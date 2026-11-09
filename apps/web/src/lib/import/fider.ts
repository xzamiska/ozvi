import { inflateRawSync } from "node:zlib";
import { BODY_MAX, emailExternalId, normEmail, TITLE_MAX,
  type ImportComment, type ImportData, type ImportFile, type ImportItem, type ImportTag, type ImportUser, type ImportVote, type Status } from "./model";

/**
 * Fider → Ozvi. Three ways in, one shape (`FiderRows`, Fider's own table columns):
 *  - backup.zip from Fider (Administration → Export → Backup): JSON per table, files in `blobs`
 *  - Fider's REST API with an administrator's API key (key used for the run only, never stored)
 *  - the CLI reading Fider's Postgres directly (scripts/import-fider.ts)
 * `fiderToImport` turns the rows into ImportData for the shared engine (engine.ts). Ids are Fider's
 * own (post id, comment id, user id), so all three sources are idempotent with each other.
 *
 * Mapping: the bug tag (default "bug") → private bug reports, other posts → ideas with their Fider
 * number kept when free, statuses → stages, duplicates merged into the original, the team's
 * status response → a comment, tags → tags (public or team-only like in Fider), users by host-app
 * id (the OAuth provider of the host app, e.g. "_billiwo") or e-mail, administrator/collaborator →
 * admin/team. Deleted posts, comments and users are left out.
 */

type Id = number;
type When = string | Date | null | undefined;

export interface FiderRows {
  tenant: { name: string | null; subdomain?: string | null } | null;
  users: { id: Id; name: string | null; email: string | null; role: number | string; status: number | string; email_supressed_at?: When }[];
  user_providers: { user_id: Id; provider: string; provider_uid: string }[];
  tags: { id: Id; name: string; slug: string; color?: string | null; is_public: boolean }[];
  posts: {
    id: Id; number: number; title: string; description: string | null; user_id: Id | null; status: number | string; created_at: When;
    response: string | null; response_user_id: Id | null; response_date: When; original_id: Id | null; is_approved?: boolean | null;
  }[];
  post_tags: { post_id: Id; tag_id: Id }[];
  post_votes: { user_id: Id; post_id: Id; created_at: When }[];
  comments: { id: Id; content: string | null; post_id: Id; user_id: Id | null; created_at: When; deleted_at?: When }[];
  attachments: { post_id: Id | null; comment_id: Id | null; attachment_bkey: string }[];
}

export const emptyRows = (): FiderRows => ({ tenant: null, users: [], user_providers: [], tags: [], posts: [], post_tags: [], post_votes: [], comments: [], attachments: [] });

export class FiderError extends Error {
  constructor(public code: "fiderKey" | "fiderNetwork" | "fiderApi" | "fiderBackup" | "fiderUrl", detail?: string) { super(detail ?? code); }
}

/* ---------- statuses and roles ---------- */

const POST_STATUS = ["open", "started", "completed", "declined", "planned", "duplicate", "deleted"] as const;
type FiderStatus = (typeof POST_STATUS)[number];
const statusName = (s: number | string): FiderStatus => {
  const v = typeof s === "number" || /^\d+$/.test(String(s)) ? POST_STATUS[Number(s)] : String(s).toLowerCase();
  return v && (POST_STATUS as readonly string[]).includes(v) ? (v as FiderStatus) : "open";
};

const IDEA: Record<FiderStatus, Status> = { open: "open", started: "in_progress", completed: "shipped", declined: "declined", planned: "planned", duplicate: "open", deleted: "open" };
const BUG: Record<FiderStatus, Status> = { open: "new", started: "in_progress", completed: "fixed", declined: "wont_fix", planned: "confirmed", duplicate: "new", deleted: "new" };

/** Fider roles: 1 visitor, 2 collaborator, 3 administrator (API: names). */
const roleOf = (r: number | string): "admin" | "team" | null => {
  const s = String(r).toLowerCase();
  return s === "3" || s === "administrator" ? "admin" : s === "2" || s === "collaborator" ? "team" : null;
};
/** Fider user status: 1 active, 2 deleted, 3 blocked. */
const isDeletedUser = (s: number | string) => String(s).toLowerCase() === "2" || String(s).toLowerCase() === "deleted";

const iso = (v: When): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(+d) ? null : d.toISOString();
};

/** Fider tag colours are hex; ours are theme tokens. Nearest by hue, grey stays muted. */
export function tagColor(hex: string | null | undefined): ImportTag["color"] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return "neutral";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.15) return "muted";
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const deg = h * 60;
  return deg < 20 || deg >= 330 ? "red" : deg < 70 ? "amber" : deg < 170 ? "green" : "accent";
}

/* ---------- what the admin chooses ---------- */

export interface FiderOptions {
  /** Slug or name of the tag that marks bug reports; null = everything is an idea. */
  bugTag: string | null;
  /** OAuth provider of the host app (its uid becomes the Ozvi external id); null = match by e-mail only. */
  provider: string | null;
}

export interface FiderSummary {
  tenant: string | null;
  tags: { slug: string; name: string; public: boolean; posts: number }[];
  providers: { name: string; users: number }[];
  suggested: FiderOptions;
  posts: number;
}

const isBugTag = (t: { slug: string; name: string }) => /^(bugs?|chyb[ay]?|defects?)$/i.test(t.slug) || /^(bugs?|chyb[ay]?)$/i.test(t.name.trim());

/** What the preview offers to choose from, with sensible defaults (the only custom "_" provider, the "bug" tag). */
export function fiderSummary(rows: FiderRows): FiderSummary {
  const live = new Set(rows.posts.filter((p) => statusName(p.status) !== "deleted").map((p) => p.id));
  const tagPosts = new Map<Id, number>();
  for (const pt of rows.post_tags) if (live.has(pt.post_id)) tagPosts.set(pt.tag_id, (tagPosts.get(pt.tag_id) ?? 0) + 1);
  const providers = new Map<string, number>();
  for (const p of rows.user_providers) providers.set(p.provider, (providers.get(p.provider) ?? 0) + 1);
  const custom = [...providers.keys()].filter((p) => p.startsWith("_"));
  const bug = rows.tags.find(isBugTag);
  return {
    tenant: rows.tenant?.name ?? null,
    tags: rows.tags.map((t) => ({ slug: t.slug, name: t.name, public: !!t.is_public, posts: tagPosts.get(t.id) ?? 0 })),
    providers: [...providers].map(([name, users]) => ({ name, users })).sort((a, b) => b.users - a.users),
    suggested: { bugTag: bug?.slug ?? null, provider: custom.length === 1 ? custom[0]! : null },
    posts: live.size,
  };
}

/* ---------- rows → ImportData ---------- */

export const fiderPostSid = (id: Id) => `post:${id}`;

export function fiderToImport(rows: FiderRows, opts: FiderOptions): ImportData {
  const want = opts.bugTag?.toLowerCase() ?? null;
  const bugTagIds = new Set(want ? rows.tags.filter((t) => t.slug.toLowerCase() === want || t.name.toLowerCase() === want).map((t) => t.id) : []);
  const tagById = new Map(rows.tags.map((t) => [t.id, t]));
  const tagsOf = new Map<Id, Id[]>();
  for (const pt of rows.post_tags) tagsOf.set(pt.post_id, [...(tagsOf.get(pt.post_id) ?? []), pt.tag_id]);
  const uid = new Map(opts.provider ? rows.user_providers.filter((p) => p.provider === opts.provider).map((p) => [p.user_id, String(p.provider_uid)]) : []);

  const people = new Map<Id, ImportUser>();
  for (const u of rows.users) {
    if (isDeletedUser(u.status)) continue; // deleted in Fider: their content stays, authorless
    const email = normEmail(u.email);
    const host = uid.get(u.id);
    const role = roleOf(u.role);
    people.set(u.id, {
      sid: `user:${u.id}`, email, name: u.name?.trim().slice(0, 120) || null,
      externalId: host ? host.slice(0, 200) : email ? emailExternalId(email) : `fider:${u.id}`,
      ...(role ? { role } : {}), ...(u.email_supressed_at ? { emailOptOut: true } : {}),
    });
  }
  const used = new Set<Id>();
  const who = (id: Id | null | undefined) => (id != null && people.has(id) ? (used.add(id), `user:${id}`) : null);

  const items: ImportItem[] = [];
  const kindOf = new Map<Id, "idea" | "bug">();
  const tagMeta = new Map<string, ImportTag>();
  const comments: ImportComment[] = [];
  for (const p of rows.posts) {
    const status = statusName(p.status);
    if (status === "deleted") continue;
    const title = String(p.title ?? "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
    if (!title) continue;
    const tagIds = tagsOf.get(p.id) ?? [];
    const kind = tagIds.some((t) => bugTagIds.has(t)) ? "bug" : "idea";
    kindOf.set(p.id, kind);
    const names: string[] = [];
    for (const id of tagIds) {
      const t = tagById.get(id);
      if (!t || bugTagIds.has(id)) continue;
      const name = t.name.trim().replace(/\s+/g, " ").slice(0, 40);
      if (!name) continue;
      names.push(name);
      if (!tagMeta.has(name.toLowerCase())) tagMeta.set(name.toLowerCase(), { name, public: !!t.is_public, color: tagColor(t.color) });
    }
    items.push({
      sid: fiderPostSid(p.id), kind, title, body: String(p.description ?? "").slice(0, BODY_MAX),
      status: (kind === "bug" ? BUG : IDEA)[status], authorSid: who(p.user_id), createdAt: iso(p.created_at), updatedAt: iso(p.response_date) ?? iso(p.created_at),
      tags: names.slice(0, 20), number: p.number, mergedIntoSid: status === "duplicate" && p.original_id ? fiderPostSid(p.original_id) : null,
      ...(p.is_approved === false ? { pending: true } : {}),
    });
    // The team's status response is a reply on the post.
    const text = String(p.response ?? "").trim();
    if (text && status !== "duplicate") {
      comments.push({ sid: `response:${p.id}`, itemSid: fiderPostSid(p.id), authorSid: who(p.response_user_id), body: text.slice(0, BODY_MAX),
        internal: false, createdAt: iso(p.response_date) ?? iso(p.created_at) });
    }
  }
  // A duplicate whose original is not imported stays a normal post.
  const imported = new Set(items.map((i) => i.sid));
  for (const i of items) if (i.mergedIntoSid && !imported.has(i.mergedIntoSid)) i.mergedIntoSid = null;

  const commentPost = new Map<Id, Id>();
  for (const c of rows.comments) {
    const body = String(c.content ?? "").trim();
    if (!kindOf.has(c.post_id) || c.deleted_at || !body) continue;
    commentPost.set(c.id, c.post_id);
    comments.push({ sid: `comment:${c.id}`, itemSid: fiderPostSid(c.post_id), authorSid: who(c.user_id), body: body.slice(0, BODY_MAX), internal: false, createdAt: iso(c.created_at) });
  }
  comments.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  // Our bug space has no votes: votes on bugs are dropped (the reporter is kept).
  const votes = new Map<string, ImportVote>();
  for (const v of rows.post_votes) {
    if (kindOf.get(v.post_id) !== "idea") continue;
    const u = who(v.user_id);
    if (!u) continue;
    const sid = `vote:${v.post_id}:${v.user_id}`;
    votes.set(sid, { sid, itemSid: fiderPostSid(v.post_id), userSid: u, weight: 1, createdAt: iso(v.created_at) });
  }

  const files = new Map<string, ImportFile>();
  for (const a of rows.attachments) {
    const post = a.post_id ?? (a.comment_id != null ? commentPost.get(a.comment_id) : undefined);
    if (post == null || !kindOf.has(post) || !a.attachment_bkey) continue;
    const sid = `file:${a.attachment_bkey}`;
    files.set(sid, { sid, itemSid: fiderPostSid(post), ref: a.attachment_bkey, name: a.attachment_bkey.split("/").pop() || "subor" });
  }

  return {
    source: "fider", users: [...people.values()].filter((u) => used.has(Number(u.sid.slice(5)))), items, comments, votes: [...votes.values()], issues: [],
    tagMeta: [...tagMeta.values()], files: [...files.values()],
  };
}

/* ---------- backup.zip ---------- */

const MAX_UNZIPPED = 300 * 1024 * 1024;

/** Minimal ZIP reader (stored + deflate, no zip64): Fider's backup is a flat zip of JSON files. */
export function unzip(buf: Uint8Array, maxTotal = MAX_UNZIPPED): Map<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new FiderError("fiderBackup", "not a zip");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > buf.length || view.getUint32(at, true) !== 0x02014b50) throw new FiderError("fiderBackup", "bad central directory");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const plain = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true), extraLen = view.getUint16(at + 30, true), commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(buf.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if (local + 30 > buf.length || view.getUint32(local, true) !== 0x04034b50) throw new FiderError("fiderBackup", "bad local header");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + size);
    total += plain;
    if (total > maxTotal) throw new FiderError("fiderBackup", "too large");
    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: Math.max(1, Math.min(plain, maxTotal)) }); } catch { throw new FiderError("fiderBackup", `cannot inflate ${name}`); }
    } else throw new FiderError("fiderBackup", `unsupported compression in ${name}`);
    out.set(name, data);
  }
  return out;
}

/** A table file: a JSON array of rows, `null` for an empty table, or one JSON row per line. */
function parseTable(bytes: Uint8Array): Record<string, unknown>[] {
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, "").trim();
  if (!text || text === "null") return [];
  if (text.startsWith("[")) {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? (v.filter((r) => r && typeof r === "object") as Record<string, unknown>[]) : [];
  }
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** `bytea` through Postgres row_to_json is "\\x…" hex; accept base64 too. */
export function blobBytes(v: unknown): Uint8Array | null {
  if (typeof v !== "string" || !v) return null;
  if (/^\\x[0-9a-f]*$/i.test(v)) return new Uint8Array(Buffer.from(v.slice(2), "hex"));
  if (/^[A-Za-z0-9+/=\s]+$/.test(v)) return new Uint8Array(Buffer.from(v, "base64"));
  return null;
}

export interface FiderBackup { rows: FiderRows; blobs: Map<string, Uint8Array> }

/** Fider's backup.zip → rows + files stored in Fider's database (blobs). */
export function fiderFromBackup(zip: Uint8Array): FiderBackup {
  let files: Map<string, Uint8Array>;
  try { files = unzip(zip); } catch (e) { throw e instanceof FiderError ? e : new FiderError("fiderBackup", String(e)); }
  const table = (name: string) => {
    for (const [path, bytes] of files) {
      const base = path.split("/").pop()!.toLowerCase().replace(/\.(nd)?json$/, "");
      if (base === name) {
        try { return parseTable(bytes); } catch { throw new FiderError("fiderBackup", `bad JSON in ${path}`); }
      }
    }
    return null;
  };
  const posts = table("posts");
  if (!posts) throw new FiderError("fiderBackup", "posts.json missing");
  const rows = emptyRows();
  const [tenant] = table("tenants") ?? [];
  rows.tenant = tenant ? { name: (tenant.name as string) ?? null, subdomain: (tenant.subdomain as string) ?? null } : null;
  const take = <K extends Exclude<keyof FiderRows, "tenant">>(k: K) => { rows[k] = (table(k) ?? []) as unknown as FiderRows[K]; };
  rows.posts = posts as unknown as FiderRows["posts"];
  take("users"); take("user_providers"); take("tags"); take("post_tags"); take("post_votes"); take("comments"); take("attachments");
  const blobs = new Map<string, Uint8Array>();
  for (const b of table("blobs") ?? []) {
    const bytes = blobBytes(b.file);
    if (typeof b.key === "string" && bytes) blobs.set(b.key, bytes);
  }
  return { rows, blobs };
}

/* ---------- REST API ---------- */

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
const MAX_RESPONSE = 50 * 1024 * 1024;

/** Base URL of the Fider site: https only (http allowed for self-host), no path beyond a prefix, no credentials. */
export function fiderBase(raw: string): string {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new FiderError("fiderUrl"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new FiderError("fiderUrl");
  if (u.username || u.password) throw new FiderError("fiderUrl");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

interface ApiUser { id: Id; name?: string | null; email?: string | null; role?: string | number; status?: string | number; providers?: { name?: string; provider?: string; uid?: string; providerUID?: string }[] }
interface ApiPost {
  id: Id; number: number; title: string; description?: string | null; createdAt?: string; status?: string | number; user?: ApiUser | null; tags?: string[];
  response?: { text?: string | null; respondedAt?: string | null; user?: ApiUser | null; original?: { number?: number } | null } | null;
  attachments?: string[] | null; isApproved?: boolean | null;
}
interface ApiComment { id: Id; content?: string | null; createdAt?: string; user?: ApiUser | null; attachments?: string[] | null }
interface ApiVote { createdAt?: string; user?: ApiUser | null }
interface ApiTag { id: Id; name: string; slug: string; color?: string | null; isPublic?: boolean }

async function call<T>(f: Fetch, base: string, key: string, path: string, opts: { optional?: boolean } = {}): Promise<T | null> {
  let res: Response;
  try {
    res = await f(`${base}${path}`, { headers: { authorization: `Bearer ${key}`, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    throw new FiderError("fiderNetwork", e instanceof Error ? e.message : String(e));
  }
  if (res.status === 401) throw new FiderError("fiderKey");
  if (res.status === 403 || res.status === 404) {
    if (opts.optional) return null;
    throw new FiderError(res.status === 403 ? "fiderKey" : "fiderApi", `HTTP ${res.status} ${path}`);
  }
  if (res.status >= 300 && res.status < 400) throw new FiderError("fiderUrl", `redirect ${res.headers.get("location") ?? ""}`);
  if (!res.ok) throw new FiderError("fiderApi", `HTTP ${res.status} ${path}`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_RESPONSE) throw new FiderError("fiderApi", `too large ${path}`);
  const text = await res.text();
  if (text.length > MAX_RESPONSE) throw new FiderError("fiderApi", `too large ${path}`);
  try { return JSON.parse(text) as T; } catch { throw new FiderError("fiderApi", `not JSON from ${path}`); }
}

/** Runs `fn` over `list`, `n` at a time. */
async function pool<T>(list: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]!); }));
}

/**
 * Everything the import needs through Fider's API (administrator key): tags, users (with their
 * OAuth providers when Fider returns them), all posts, then comments and votes per post.
 */
export async function fiderFromApi(baseUrl: string, key: string, opts: { fetch: Fetch; progress?: (n: number) => void | Promise<void>; max?: number }): Promise<FiderRows> {
  const base = fiderBase(baseUrl);
  const f = opts.fetch;
  const max = opts.max ?? 200_000;
  let n = 0;
  const tick = async (k: number) => { n += k; if (n > max) throw new FiderError("fiderApi", "too much data"); await opts.progress?.(n); };
  const rows = emptyRows();

  const tags = (await call<ApiTag[]>(f, base, key, "/api/v1/tags")) ?? [];
  rows.tags = tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug, color: t.color ?? null, is_public: t.isPublic !== false }));
  const tagBySlug = new Map(rows.tags.map((t) => [t.slug, t.id]));

  const users = new Map<Id, FiderRows["users"][number]>();
  const seen = (u: ApiUser | null | undefined) => {
    if (!u || typeof u.id !== "number") return null;
    const prev = users.get(u.id);
    const row = { id: u.id, name: u.name ?? prev?.name ?? null, email: u.email || prev?.email || null, role: u.role ?? prev?.role ?? 1, status: u.status ?? prev?.status ?? 1 };
    users.set(u.id, row);
    for (const p of u.providers ?? []) {
      const name = p.name ?? p.provider; const uid = p.uid ?? p.providerUID;
      if (name && uid && !rows.user_providers.some((x) => x.user_id === u.id && x.provider === name)) rows.user_providers.push({ user_id: u.id, provider: name, provider_uid: String(uid) });
    }
    return u.id;
  };
  for (const u of (await call<ApiUser[]>(f, base, key, "/api/v1/users", { optional: true })) ?? []) seen(u);

  // view=all lists every post except duplicates (and deleted); statuses=duplicate adds those where supported.
  const posts = new Map<Id, ApiPost>();
  for (const p of (await call<ApiPost[]>(f, base, key, "/api/v1/posts?view=all&limit=all")) ?? []) posts.set(p.id, p);
  for (const p of (await call<ApiPost[]>(f, base, key, "/api/v1/posts?view=all&limit=all&statuses=duplicate", { optional: true })) ?? []) {
    if (!posts.has(p.id) && String(p.status).toLowerCase() === "duplicate") posts.set(p.id, p);
  }
  await tick(posts.size);
  const idByNumber = new Map([...posts.values()].map((p) => [p.number, p.id]));
  for (const p of posts.values()) {
    rows.posts.push({
      id: p.id, number: p.number, title: p.title, description: p.description ?? "", user_id: seen(p.user), status: p.status ?? "open", created_at: p.createdAt ?? null,
      response: p.response?.text ?? null, response_user_id: seen(p.response?.user), response_date: p.response?.respondedAt ?? null,
      original_id: p.response?.original?.number ? idByNumber.get(p.response.original.number) ?? null : null, is_approved: p.isApproved ?? null,
    });
    for (const slug of p.tags ?? []) { const t = tagBySlug.get(slug); if (t != null) rows.post_tags.push({ post_id: p.id, tag_id: t }); }
    for (const k of p.attachments ?? []) rows.attachments.push({ post_id: p.id, comment_id: null, attachment_bkey: k });
  }

  await pool([...posts.values()], 6, async (p) => {
    const comments = (await call<ApiComment[]>(f, base, key, `/api/v1/posts/${p.number}/comments`)) ?? [];
    for (const c of comments) {
      rows.comments.push({ id: c.id, content: c.content ?? "", post_id: p.id, user_id: seen(c.user), created_at: c.createdAt ?? null });
      for (const k of c.attachments ?? []) rows.attachments.push({ post_id: null, comment_id: c.id, attachment_bkey: k });
    }
    const votes = (await call<ApiVote[]>(f, base, key, `/api/v1/posts/${p.number}/votes`, { optional: true })) ?? [];
    for (const v of votes) { const u = seen(v.user); if (u != null) rows.post_votes.push({ user_id: u, post_id: p.id, created_at: v.createdAt ?? null }); }
    await tick(comments.length + votes.length);
  });
  rows.users = [...users.values()];
  rows.tenant = { name: new URL(base).hostname };
  return rows;
}

/** Fider serves uploaded files at /static/images/<key>; same key, same base, size-capped. */
export function fiderApiFiles(baseUrl: string, key: string, f: Fetch, maxBytes = 10 * 1024 * 1024) {
  const base = fiderBase(baseUrl);
  return async (ref: string): Promise<Uint8Array | null> => {
    if (!/^[\w./-]{1,300}$/.test(ref) || ref.includes("..")) return null;
    const res = await f(`${base}/static/images/${ref.split("/").map(encodeURIComponent).join("/")}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length > maxBytes ? null : bytes;
  };
}
