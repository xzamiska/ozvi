import { schema, type Tx } from "@ozvi/db";
import { and, asc, eq } from "drizzle-orm";
import { fail } from "./domain";

/**
 * Proof of a fix: the merged PRs, the release and an optional preview/demo URL. Collected on the item
 * (item_proofs: GitHub pull_request webhook, MCP set_status, the team) and snapshotted onto the status
 * event when the item reaches fixed/shipped, so the reporter's "works for you?" e-mail, the timeline,
 * webhooks and MCP all show the same evidence.
 */

export interface ProofPr { url: string; title: string | null; ref: string | null }
export interface ProofSnapshot {
  prs: ProofPr[];
  release?: { tag: string; url: string | null } | null;
  preview?: string | null;
}

const MAX_URL = 500;

/** Only absolute https URLs (http on localhost for development); nothing else ever becomes a link. */
export function cleanProofUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > MAX_URL) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  const local = u.hostname === "localhost" || u.hostname.endsWith(".localhost");
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
  if (u.username || u.password) return null;
  return u.toString();
}

/** "https://github.com/o/r/pull/45" → "o/r#45". */
export function prRef(url: string): string | null {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/(\d+)(?:[/?#].*)?$/.exec(url);
  return m ? `${m[1]}#${m[2]}` : null;
}

/**
 * What a merged PR says about Ozvi items:
 * - "Ozvi: #12, #13" (or "Ozvi #12") → those board items
 * - "Ozvi-Preview: https://…" → a preview/demo URL
 * - "Fixes #40", "closes acme/app#41", "resolves https://github.com/acme/app/issues/42" → issues of `repo`
 */
export function parsePrBody(text: string, repo: string): { items: number[]; issues: number[]; preview: string | null } {
  const items = new Set<number>();
  const issues = new Set<number>();
  let preview: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^\s*(?:[-*]\s*)?ozvi\s*:?\s*((?:#\d+[\s,]*)+)/i.exec(line);
    if (marker) for (const n of marker[1]!.matchAll(/#(\d+)/g)) items.add(Number(n[1]));
    const pv = /^\s*(?:[-*]\s*)?ozvi-preview\s*:\s*(\S+)/i.exec(line);
    if (pv && !preview) preview = cleanProofUrl(pv[1]!);
  }
  const esc = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const kw = "(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)";
  const re = new RegExp(`\\b${kw}:?\\s+(?:(?:https://github\\.com/${esc}/issues/)|(?:${esc}#)|#)(\\d+)\\b`, "gi");
  for (const m of text.matchAll(re)) issues.add(Number(m[1]));
  return { items: [...items].filter((n) => n > 0).slice(0, 20), issues: [...issues].filter((n) => n > 0).slice(0, 20), preview };
}

export async function attachProof(tx: Tx, projectId: string, itemId: string, p: { kind: "pr" | "preview"; url: string; title?: string | null; ref?: string | null }, actorId: string | null) {
  const url = cleanProofUrl(p.url);
  if (!url) throw fail((t) => t("proofUrl"));
  const ref = p.kind === "pr" ? (p.ref ?? prRef(url)) : null;
  await tx.insert(schema.itemProofs).values({ projectId, itemId, kind: p.kind, url, title: p.title?.slice(0, 300) ?? null, ref, actorId })
    .onConflictDoUpdate({ target: [schema.itemProofs.itemId, schema.itemProofs.kind, schema.itemProofs.url],
      set: { title: p.title?.slice(0, 300) ?? null, ...(ref ? { ref } : {}) } });
}

export async function listProofs(tx: Tx, itemId: string) {
  return tx.select().from(schema.itemProofs).where(eq(schema.itemProofs.itemId, itemId)).orderBy(asc(schema.itemProofs.createdAt));
}

export async function removeProof(tx: Tx, itemId: string, proofId: string) {
  await tx.delete(schema.itemProofs).where(and(eq(schema.itemProofs.id, proofId), eq(schema.itemProofs.itemId, itemId)));
}

/** What the item's proofs look like right now (+ the release that shipped it); null when there is nothing to show. */
export async function proofSnapshot(tx: Tx, itemId: string, release?: { tag: string; url: string | null } | null): Promise<ProofSnapshot | null> {
  const rows = await listProofs(tx, itemId);
  const prs = rows.filter((r) => r.kind === "pr").slice(0, 10).map((r) => ({ url: r.url, title: r.title, ref: r.ref }));
  const preview = rows.filter((r) => r.kind === "preview").at(-1)?.url ?? null;
  if (prs.length === 0 && !preview && !release) return null;
  return { prs, ...(release ? { release } : {}), ...(preview ? { preview } : {}) };
}

/** Defensive read of the jsonb column (older rows have none; never trust its shape blindly). */
export function readProof(raw: unknown): ProofSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const prs = Array.isArray(r.prs) ? r.prs.flatMap((p) => {
    const o = p as Record<string, unknown>;
    const url = typeof o?.url === "string" ? cleanProofUrl(o.url) : null;
    return url ? [{ url, title: typeof o.title === "string" ? o.title : null, ref: typeof o.ref === "string" ? o.ref : null }] : [];
  }) : [];
  const rel = r.release as Record<string, unknown> | undefined;
  const release = rel && typeof rel.tag === "string"
    ? { tag: rel.tag, url: typeof rel.url === "string" ? cleanProofUrl(rel.url) : null } : null;
  const preview = typeof r.preview === "string" ? cleanProofUrl(r.preview) : null;
  if (prs.length === 0 && !release && !preview) return null;
  return { prs, release, preview };
}

/** Who sees what: PRs may live in a private repo, so on public ideas only the team sees them. Bugs are reporter + team anyway. */
export function visibleProof(p: ProofSnapshot | null, kind: "bug" | "idea", team: boolean): ProofSnapshot | null {
  if (!p || team || kind === "bug") return p;
  const out = { ...p, prs: [] };
  return out.release || out.preview ? out : null;
}
