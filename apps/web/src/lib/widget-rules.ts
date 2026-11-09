/**
 * Pure rules of the widget read API (ideas, roadmap and changelog embeds): CORS, limits, search words.
 * No database or request objects here, so they are unit-tested directly (widget-api.test.ts).
 */

/** Search words for "similar ideas": the same rule as the board's /<slug>/search (3+ letters, at most 6). */
export function searchWords(q: string | null | undefined): string[] {
  return (q ?? "").toLowerCase().split(/\s+/).filter((w) => w.length >= 3).slice(0, 6);
}

/** Integer query parameter within [1, max], `def` when missing or not a number. */
export function clampLimit(raw: string | null | undefined, def: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : def;
}

/**
 * CORS for the widget's GET endpoints.
 * - Trusted origins (the project's allowed origins, the board's own origins) may send the Authorization header
 *   (a signed SSO token), so the response depends on who is asking and must not be cached publicly.
 * - Any other site gets public data only (`*`, no credentials, no Authorization header): an embedded roadmap or
 *   changelog on a marketing site of a public board. The preflight for Authorization fails there by design.
 */
export function readCors(allowed: readonly string[], own: readonly string[], origin: string | null): { headers: Record<string, string>; trusted: boolean } {
  if (origin && (allowed.includes(origin) || own.includes(origin))) {
    return {
      trusted: true,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-max-age": "600",
        vary: "Origin, Authorization",
      },
    };
  }
  return { trusted: !origin, headers: { "access-control-allow-origin": "*", vary: "Origin, Authorization" } };
}

/** Write endpoints (vote): same-origin requests or the project's allowed origins only. */
export function writeAllowed(allowed: readonly string[], own: readonly string[], origin: string | null): boolean {
  return !origin || allowed.includes(origin) || own.includes(origin);
}

/** Vote request body → item id and requested weight (the server still decides the real weight). */
export function parseVote(raw: unknown): { id: string; weight: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && /^[0-9a-f-]{36}$/i.test(r.id) ? r.id : null;
  const weight = typeof r.weight === "number" && Number.isFinite(r.weight) ? r.weight : null;
  return id && weight !== null ? { id, weight } : null;
}
