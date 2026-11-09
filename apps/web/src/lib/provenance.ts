import type { Source, Trust } from "@ozvi/mcp";

/**
 * Provenance for agents: who wrote a piece of text and how much we know about them, and where it
 * came in. Exposed on every item and comment in MCP, webhooks and GitHub issues, so an agent (or the
 * team) can weigh text from an anonymous visitor differently from a verified customer or the team.
 *
 * - team: the project's team or admins.
 * - sso_customer: signed in through the host app (SSO token) or OpenID Connect: the host vouches for them.
 * - email_verified: signed in with an e-mailed code/link (`email:` users).
 * - anonymous: no account behind the text (deleted author, GitHub/system notes), imported people
 *   (the source tool vouched, we did not), and customers named by an agent in submit_insight.
 * - system: ideas Ozvi filed from customer feedback (submit_insight). No person is the author: the board
 *   shows "From customer feedback", the customers are voters (team-only "Kto to chce").
 */

export type { Source as ItemSource, Trust } from "@ozvi/mcp";

export const SOURCES = ["board", "widget", "mcp", "import", "api"] as const satisfies readonly Source[];

export interface TrustSubject {
  role: "member" | "team" | "admin";
  externalId: string;
  traits?: unknown;
}

/** Prefix of people created from an agent's insight (MCP submit_insight): an e-mail somebody typed, not verified. */
export const INSIGHT_PREFIX = "insight:";

export function trustOf(u: TrustSubject | null | undefined): Trust {
  if (!u) return "anonymous";
  if (u.role === "team" || u.role === "admin") return "team";
  const traits = (u.traits && typeof u.traits === "object" ? u.traits : {}) as Record<string, unknown>;
  if (traits.importedFrom || u.externalId.startsWith(INSIGHT_PREFIX)) return "anonymous";
  if (u.externalId.startsWith("email:")) return "email_verified";
  return "sso_customer";
}

/** Trusted enough for lockdown mode: everybody whose identity Ozvi or the host app verified. */
export const isVerifiedTrust = (t: Trust) => t !== "anonymous";

export const sourceOf = (s: string | null | undefined): Source => (SOURCES as readonly string[]).includes(s ?? "") ? (s as Source) : "board";

/** Ideas from customer insights: no author row, marked in context (no fake user, nothing in people lists or exports). */
export const isSystemItem = (i: { authorId: string | null; context?: unknown }) =>
  !i.authorId && !!i.context && typeof i.context === "object" && (i.context as Record<string, unknown>).insight === true;

/** Author of an item: the system mark for insight ideas, otherwise the person (or anonymous). */
export function itemAuthorOf(item: { authorId: string | null; context?: unknown }, u: (TrustSubject & { name: string | null }) | null | undefined): { name: string | null; trust: Trust } {
  return isSystemItem(item) ? { name: null, trust: "system" } : authorOf(u);
}

/** The `author` object for MCP and webhooks. */
export function authorOf(u: (TrustSubject & { name: string | null }) | null | undefined): { name: string | null; trust: Trust } {
  return { name: u?.name ?? null, trust: trustOf(u) };
}
