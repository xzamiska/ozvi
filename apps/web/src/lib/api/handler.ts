import { createHash } from "node:crypto";
import { applyLockdown, scopeAllows, ToolError } from "@ozvi/mcp";
import { z } from "zod";
import { resolveBoardLocale } from "@/i18n/board";
import { clientIp } from "../client-ip";
import { DomainError } from "../domain";
import { ValidationError } from "../items";
import { mcpBackend } from "../mcp-backend";
import { RateLimitError, take, type RateState } from "../ratelimit";
import { authenticateToken, parseLockdown, type TokenAuth } from "../tokens";
import { claim, fingerprint, KEY_RE, release, settle, type Stored } from "./idempotency";
import { openApiSpec } from "./openapi";
import { ApiProblem, problemBody } from "./problem";
import { ROUTES, type Ctx, type Route } from "./routes";
import { ApiNotFound, CursorError } from "./types";

/**
 * Public REST API v1 at /<slug>/api/v1/… (also on the project's custom domain). Stateless like MCP:
 * every request authenticates a personal access token of this project, gets the same backend as MCP
 * (lib/mcp-backend.ts, channel "api") and the same scope, role, lockdown and provenance rules.
 */

const MAX_BODY = 64 * 1024;

function match(method: string, segments: string[]): { route: Route; params: Record<string, string> } | { allowed: string[] } | null {
  const allowed: string[] = [];
  for (const r of ROUTES) {
    const parts = r.path.split("/").filter(Boolean);
    if (parts.length !== segments.length) continue;
    const params: Record<string, string> = {};
    if (!parts.every((p, i) => (p.startsWith("{") ? ((params[p.slice(1, -1)] = segments[i]!), true) : p === segments[i]))) continue;
    if (r.method === method) return { route: r, params };
    allowed.push(r.method);
  }
  return allowed.length ? { allowed } : null;
}

const rateHeaders = (r: RateState): Record<string, string> => ({
  "ratelimit-limit": String(r.limit), "ratelimit-remaining": String(r.remaining), "ratelimit-reset": String(r.resetSeconds),
});

const BASE_HEADERS = { "x-content-type-options": "nosniff", "cache-control": "private, no-cache" };

function json(status: number, body: unknown, headers: Record<string, string> = {}, problem = false): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status, headers: { "content-type": problem ? "application/problem+json" : "application/json; charset=utf-8", ...BASE_HEADERS, ...headers },
  });
}

function problem(p: ApiProblem, instance: string, headers: Record<string, string> = {}): Response {
  return json(p.status, problemBody(p, instance), { ...headers, ...p.headers }, true);
}

const etagOf = (body: string) => `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`;
function notModified(req: Request, etag: string): boolean {
  const inm = req.headers.get("if-none-match");
  if (!inm) return false;
  return inm.trim() === "*" || inm.split(",").map((s) => s.trim().replace(/^W\//, "")).includes(etag);
}

const issuePath = (path: PropertyKey[]) => path.map(String).join(".") || "(root)";
function invalid(where: string, e: z.ZodError): ApiProblem {
  return new ApiProblem("invalid_request", `Check the ${where}.`, {
    errors: e.issues.slice(0, 20).map((i) => ({ path: `${where}${i.path.length ? `.${issuePath(i.path)}` : ""}`, message: i.message })),
  });
}

/** Maps backend errors to problems; anything unexpected is logged and answered as a bare 500. */
function toProblem(e: unknown): ApiProblem {
  if (e instanceof ApiProblem) return e;
  if (e instanceof ApiNotFound) return new ApiProblem("not_found", e.message);
  if (e instanceof CursorError) return new ApiProblem("invalid_cursor", "Start again without cursor, or pass nextCursor from the same list and sort.");
  if (e instanceof RateLimitError) return new ApiProblem("rate_limited", e.message, {}, { "retry-after": "60" });
  if (e instanceof ToolError || e instanceof DomainError || e instanceof ValidationError) {
    // The MCP backend wraps rate limits from the domain as ToolErrors with the same text.
    if (e.message === new RateLimitError().message) return new ApiProblem("rate_limited", e.message, {}, { "retry-after": "60" });
    return new ApiProblem("unprocessable", e.message);
  }
  console.error("[ozvi] api request failed", e);
  return new ApiProblem("internal", "Something went wrong in Ozvi. Try again; if it persists, the server log has the details.");
}

/**
 * @param segments path after /api/v1 (["items", "12"])
 * @param origin   the origin the client used (custom domain or the primary host), for the spec's server URL
 */
export async function handleApi(req: Request, slug: string, segments: string[], origin: string): Promise<Response> {
  const url = new URL(req.url);
  const instance = url.pathname;
  const method = req.method.toUpperCase();

  // The spec is public (no data in it), like any OpenAPI document.
  if (segments.length === 1 && segments[0] === "openapi.json" && (method === "GET" || method === "HEAD")) {
    return json(200, openApiSpec(`${origin}/${slug}/api/v1`), { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" });
  }

  const ip = take("apiIp", clientIp(req.headers));
  if (!ip.ok) return problem(new ApiProblem("rate_limited", "Too many requests from this address.", {}, { "retry-after": String(ip.resetSeconds) }), instance, rateHeaders(ip));

  const auth = await authenticateToken(req.headers.get("authorization"));
  const challenge = { "www-authenticate": 'Bearer realm="ozvi"' };
  if (!auth) return problem(new ApiProblem("unauthorized", "Send a personal access token as Authorization: Bearer ozvi_pat_… (create one in Ozvi → My API tokens)."), instance, challenge);
  if (auth.project.slug !== slug) return problem(new ApiProblem("token_audience", `This token belongs to another project; this API is /${slug}/api/v1.`), instance, challenge);
  // OAuth tokens are issued for the MCP resource (/<slug>/mcp, RFC 8707 audience); the REST API takes personal tokens only.
  if (auth.oauth) return problem(new ApiProblem("token_audience", "OAuth tokens are issued for MCP only. Use a personal access token for the REST API."), instance, challenge);

  const rl = take("api", auth.tokenId);
  const rh = rateHeaders(rl);
  if (!rl.ok) return problem(new ApiProblem("rate_limited", "Too many requests for this token.", {}, { "retry-after": String(rl.resetSeconds) }), instance, rh);

  const m = match(method === "HEAD" ? "GET" : method, segments);
  if (!m) return problem(new ApiProblem("not_found", `No such endpoint. The OpenAPI document is at /${slug}/api/v1/openapi.json.`), instance, rh);
  if ("allowed" in m) return problem(new ApiProblem("method_not_allowed", `Use ${m.allowed.join(", ")}.`), instance, { ...rh, allow: m.allowed.join(", ") });
  const { route } = m;

  try {
    const params = route.params ? route.params.safeParse(m.params) : { success: true as const, data: {} };
    if (!params.success) throw route.path.includes("{number}") ? new ApiProblem("not_found", "Item numbers are positive integers.") : new ApiProblem("not_found", "Not a valid id.");
    const rawQuery = Object.fromEntries(url.searchParams);
    const query = route.query ? route.query.safeParse(rawQuery) : { success: true as const, data: {} };
    if (!query.success) throw invalid("query", query.error);

    let rawBody = "";
    let body: Record<string, unknown> = {};
    if (route.body) {
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > MAX_BODY) throw new ApiProblem("payload_too_large", `At most ${MAX_BODY / 1024} kB.`);
      rawBody = await req.text();
      if (rawBody.length > MAX_BODY) throw new ApiProblem("payload_too_large", `At most ${MAX_BODY / 1024} kB.`);
      if (rawBody.trim()) {
        const ct = (req.headers.get("content-type") ?? "").toLowerCase();
        if (!/^application\/([\w.+-]+\+)?json\b/.test(ct)) throw new ApiProblem("unsupported_media_type");
        let parsed: unknown;
        try { parsed = JSON.parse(rawBody); } catch { throw new ApiProblem("invalid_json"); }
        const r = route.body.safeParse(parsed);
        if (!r.success) throw invalid("body", r.error);
        body = r.data as Record<string, unknown>;
      } else {
        const r = route.body.safeParse({});
        if (!r.success) throw invalid("body", r.error);
        body = r.data as Record<string, unknown>;
      }
    }

    // Scope: the token's (already capped by the owner's role), then per-request needs and the admin rule.
    const need = route.need?.({ query: query.data as Record<string, unknown>, body }) ?? route.scope;
    for (const s of [route.scope, need]) {
      if (!scopeAllows(auth.scope, s)) {
        throw new ApiProblem("insufficient_scope", `This needs a token with the "${s}" scope${s === "triage" ? " owned by a team member" : ""}; this token has "${auth.scope}".`,
          { required: s, granted: auth.scope });
      }
    }
    if (route.admin && auth.user.role !== "admin") throw new ApiProblem("forbidden", "Only the project's admins can do this.");

    // Idempotency-Key (POST creates): replay the first answer for a retry of the same request.
    const idemKey = route.idempotent ? req.headers.get("idempotency-key") : null;
    if (idemKey !== null && !KEY_RE.test(idemKey)) throw new ApiProblem("invalid_request", "Idempotency-Key: 1–255 visible ASCII characters.");
    const idemScope = auth.tokenId;
    if (idemKey) {
      const c = claim(idemScope, idemKey, fingerprint(method, url.pathname, rawBody));
      if (c.kind === "mismatch") throw new ApiProblem("idempotency_key_reused", "Use a new key for a different request.");
      if (c.kind === "in_progress") throw new ApiProblem("idempotency_in_progress", "Wait for the first request to finish, then retry.", {}, { "retry-after": "1" });
      if (c.kind === "replay") {
        return new Response(c.result.body, { status: c.result.status, headers: { ...c.result.headers, ...rh, "idempotent-replayed": "true" } });
      }
    }

    let res: Response;
    try {
      res = await execute(req, route, auth, m.params, query.data as Record<string, unknown>, body, rh, instance);
    } catch (e) {
      if (idemKey) release(idemScope, idemKey);
      throw e;
    }
    if (idemKey) {
      const stored: Stored = { status: res.status, body: await res.clone().text(), headers: Object.fromEntries(res.headers) };
      settle(idemScope, idemKey, stored);
    }
    return method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
  } catch (e) {
    const p = toProblem(e);
    return problem(p, instance, rh);
  }
}

async function execute(req: Request, route: Route, auth: TokenAuth, rawParams: Record<string, string>, query: Record<string, unknown>,
  body: Record<string, unknown>, rh: Record<string, string>, instance: string): Promise<Response> {
  const lockdown = parseLockdown(req.headers.get("x-ozvi-lockdown") ?? req.headers.get("ozvi-lockdown"));
  const locale = resolveBoardLocale(auth.project, null, req.headers.get("accept-language"));
  const b = await mcpBackend({ ...auth, lockdown }, "api", locale);
  const params = route.params ? (route.params.parse(rawParams) as Record<string, unknown>) : {};
  const ctx: Ctx = { b, auth, lockdown: b.lockdown, locale, params, query, body, req };
  try {
    const out = await route.run(ctx);
    if (out instanceof Response) {
      for (const [k, v] of Object.entries({ ...rh, ...BASE_HEADERS, "cache-control": "no-store" })) out.headers.set(k, v);
      return out;
    }
    const status = out.status ?? route.response.status;
    // Lockdown applies to every payload the same way as in MCP: text from untrusted authors is withheld.
    const text = JSON.stringify(applyLockdown(out.body, b.lockdown));
    const headers: Record<string, string> = { ...rh, ...(out.headers ?? {}), "content-language": locale };
    if (route.method === "GET" && status === 200) {
      const etag = etagOf(text);
      headers.etag = etag;
      if (notModified(req, etag)) return new Response(null, { status: 304, headers: { ...BASE_HEADERS, ...headers } });
    }
    return new Response(text, { status, headers: { "content-type": "application/json; charset=utf-8", ...BASE_HEADERS, ...headers } });
  } catch (e) {
    const p = toProblem(e);
    if (p.code !== "internal") return problem(p, instance, rh);
    throw e;
  }
}
