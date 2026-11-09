import { BODY_MAX, emailExternalId, mapStatus, normEmail, priorityWeight, splitTags, TITLE_MAX,
  type ImportComment, type ImportData, type ImportItem, type ImportUser, type ImportVote, type Kind, type RowIssue } from "./model";

/**
 * Canny import through its REST API (https://developers.canny.io/api-reference): every call is a POST
 * to https://canny.io/api/… with the admin's secret `apiKey` in the body. We read boards, posts
 * (skip/limit), comments and votes (v2, cursor). The key is used for this run only and never stored.
 *
 * Mapping: each board → ideas or bugs (admin's choice, default by name), Canny statuses → stages
 * (custom ones kept as a sub-status label), votePriority → importance weight, tags → our tags,
 * internal comments → team notes. Items are keyed by the post URL, the same key the Canny CSV
 * export carries, so a CSV import followed by an API import does not duplicate posts.
 */

export const CANNY_API = "https://canny.io/api";

export interface CannyUser { id: string; email?: string | null; name?: string | null; userID?: string | null; isAdmin?: boolean; companies?: { name?: string; id?: string; monthlySpend?: number | null }[] }
export interface CannyBoard { id: string; name: string; postCount?: number; isPrivate?: boolean }
export interface CannyTag { id: string; name: string }
export interface CannyPost {
  id: string; title: string; details?: string | null; status?: string | null; score?: number; created?: string;
  author?: CannyUser | null; by?: CannyUser | null; board?: { id: string; name?: string }; tags?: CannyTag[]; url?: string; imageURLs?: string[];
}
export interface CannyComment { id: string; value?: string | null; author?: CannyUser | null; created?: string; internal?: boolean; private?: boolean; parentID?: string | null; post?: { id: string }; imageURLs?: string[]; status?: string }
export interface CannyVote { id: string; voter?: CannyUser | null; created?: string; post?: { id: string }; votePriority?: string | null }

export interface CannyDump { boards: CannyBoard[]; posts: CannyPost[]; comments: CannyComment[]; votes: CannyVote[] }

/** Board → kind, default: names with "bug" go to the private bug space, everything else is an idea. */
export const defaultBoardKind = (name: string): Kind | "skip" => (/bug|chyb|defect|issue/i.test(name) ? "bug" : "idea");

export function cannyUser(u: CannyUser | null | undefined): ImportUser | null {
  if (!u?.id) return null;
  const email = normEmail(u.email);
  const company = u.companies?.[0];
  const traits: Record<string, string | number> = {};
  if (company?.name) traits.company = company.name.slice(0, 120);
  if (company?.id) traits.companyId = String(company.id).slice(0, 120);
  // Canny's monthlySpend is in whole currency units; our traits keep cents.
  if (typeof company?.monthlySpend === "number" && company.monthlySpend >= 0) traits.mrr = Math.round(company.monthlySpend * 100);
  return {
    sid: email ? `email:${email}` : `canny:${u.id}`, email, name: u.name?.trim().slice(0, 120) || null,
    externalId: u.userID ? String(u.userID).slice(0, 200) : email ? emailExternalId(email) : `canny:${u.id}`,
    traits: Object.keys(traits).length ? traits : undefined,
  };
}

const withImages = (text: string, urls: string[] | undefined) => {
  const links = (urls ?? []).filter((u) => /^https?:\/\//i.test(u));
  return links.length ? `${text}${text ? "\n\n" : ""}${links.join("\n")}` : text;
};

export const postSid = (p: CannyPost) => (p.url ? `id:${p.url}` : `canny:${p.id}`);

/** Canny dump → ImportData with the admin's board choices (missing board = default by name). */
export function cannyToImport(dump: CannyDump, boardKinds: Record<string, Kind | "skip"> = {}): ImportData {
  const users = new Map<string, ImportUser>();
  const add = (u: CannyUser | null | undefined) => {
    const x = cannyUser(u);
    if (!x) return null;
    const prev = users.get(x.sid);
    if (!prev) users.set(x.sid, x);
    else { prev.name ??= x.name; if (x.traits && !prev.traits) prev.traits = x.traits; if (x.externalId && !x.externalId.startsWith("email:") && prev.externalId?.startsWith("email:")) prev.externalId = x.externalId; }
    return x.sid;
  };
  const kindOf = new Map(dump.boards.map((b) => [b.id, boardKinds[b.id] ?? defaultBoardKind(b.name)]));
  const issues: RowIssue[] = [];
  const items: ImportItem[] = [];
  const postKind = new Map<string, { sid: string; kind: Kind }>();
  for (const p of dump.posts) {
    const kind = kindOf.get(p.board?.id ?? "") ?? defaultBoardKind(p.board?.name ?? "");
    if (kind === "skip") continue;
    const title = (p.title ?? "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
    if (!title) { issues.push({ row: 0, key: "titleMissing", value: p.url ?? p.id, level: "error" }); continue; }
    const st = mapStatus(kind, p.status);
    const sid = postSid(p);
    items.push({
      sid, kind, title, body: withImages(p.details ?? "", p.imageURLs).slice(0, BODY_MAX), status: st.status, subStatus: st.sub,
      authorSid: add(p.author) ?? add(p.by), createdAt: p.created ?? null, tags: splitTags((p.tags ?? []).map((t) => t.name).join(",")),
    });
    postKind.set(p.id, { sid, kind });
  }
  const comments: ImportComment[] = [];
  for (const c of dump.comments) {
    const post = postKind.get(c.post?.id ?? "");
    const body = withImages((c.value ?? "").trim(), c.imageURLs);
    if (!post || !body || c.status === "deleted") continue;
    comments.push({ sid: `canny:${c.id}`, itemSid: post.sid, authorSid: add(c.author), body: body.slice(0, BODY_MAX), internal: !!c.internal || !!c.private, createdAt: c.created ?? null });
  }
  const votes: ImportVote[] = [];
  for (const v of dump.votes) {
    const post = postKind.get(v.post?.id ?? "");
    const userSid = add(v.voter);
    // Our bug space has no votes: votes on bug boards are dropped (the reporters are kept).
    if (!post || !userSid || post.kind !== "idea") continue;
    votes.push({ sid: `${post.sid}|${userSid}`, itemSid: post.sid, userSid, weight: priorityWeight(v.votePriority), createdAt: v.created ?? null });
  }
  return { source: "canny", users: [...users.values()], items, comments, votes: [...new Map(votes.map((v) => [v.sid, v])).values()], issues };
}

/* ---------- API client ---------- */

export class CannyError extends Error {
  constructor(public code: "key" | "network" | "api", detail?: string) { super(detail ?? code); }
}

type Fetch = typeof fetch;

async function call<T>(f: Fetch, path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await f(`${CANNY_API}/${path}`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000), redirect: "error",
    });
  } catch (e) { throw new CannyError("network", e instanceof Error ? e.message : String(e)); }
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (res.status === 401 || res.status === 403 || json?.error === "invalid api key" || /api ?key/i.test(json?.error ?? "")) throw new CannyError("key");
  if (!res.ok || !json || json.error) throw new CannyError("api", json?.error ?? `HTTP ${res.status}`);
  return json;
}

export async function cannyBoards(apiKey: string, f: Fetch = fetch): Promise<CannyBoard[]> {
  return (await call<{ boards: CannyBoard[] }>(f, "v1/boards/list", { apiKey })).boards ?? [];
}

/** Everything we import, page by page; `progress` gets a running count for the job's status line. */
export async function cannyDump(apiKey: string, boardIds: string[], opts: { fetch?: Fetch; progress?: (n: number) => void | Promise<void>; max?: number } = {}): Promise<CannyDump> {
  const f = opts.fetch ?? fetch;
  const max = opts.max ?? 200_000;
  let n = 0;
  const tick = async (k: number) => { n += k; if (n > max) throw new CannyError("api", "too much data"); await opts.progress?.(n); };
  const boards = (await cannyBoards(apiKey, f)).filter((b) => boardIds.includes(b.id));
  const posts: CannyPost[] = [];
  const comments: CannyComment[] = [];
  const votes: CannyVote[] = [];
  for (const b of boards) {
    for (let skip = 0; ;) {
      const r = await call<{ posts: CannyPost[]; hasMore: boolean }>(f, "v1/posts/list", { apiKey, boardID: b.id, limit: 100, skip, sort: "oldest" });
      posts.push(...(r.posts ?? [])); await tick(r.posts?.length ?? 0);
      if (!r.hasMore || !r.posts?.length) break;
      skip += r.posts.length;
    }
    for (const [path, out] of [["v2/comments/list", comments], ["v2/votes/list", votes]] as const) {
      let cursor: string | undefined;
      for (;;) {
        const r = await call<{ items: never[]; hasNextPage: boolean; cursor?: string }>(f, path, { apiKey, boardID: b.id, limit: 100, ...(cursor ? { cursor } : {}) });
        (out as unknown[]).push(...(r.items ?? [])); await tick(r.items?.length ?? 0);
        if (!r.hasNextPage || !r.cursor || r.cursor === cursor) break;
        cursor = r.cursor;
      }
    }
  }
  return { boards, posts, comments, votes };
}
