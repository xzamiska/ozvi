import { publicUrl } from "../email/url";

/**
 * RFC 9457 problem details for the REST API. `code` is the stable, machine-readable part (documented
 * at /docs/api#errors); `title` is fixed per code, `detail` says what happened in this request.
 */

export const PROBLEMS = {
  unauthorized: { status: 401, title: "Missing or invalid token" },
  token_audience: { status: 401, title: "This token is not valid for this API" },
  insufficient_scope: { status: 403, title: "The token's scope does not allow this" },
  forbidden: { status: 403, title: "The token owner's role does not allow this" },
  lockdown_active: { status: 403, title: "Not available while lockdown is on" },
  not_found: { status: 404, title: "Not found" },
  method_not_allowed: { status: 405, title: "Method not allowed" },
  confirmation_required: { status: 409, title: "This action needs confirmation" },
  idempotency_in_progress: { status: 409, title: "A request with this Idempotency-Key is still running" },
  payload_too_large: { status: 413, title: "Request body too large" },
  unsupported_media_type: { status: 415, title: "Send the body as application/json" },
  invalid_request: { status: 400, title: "The request is not valid" },
  invalid_json: { status: 400, title: "The body is not valid JSON" },
  invalid_cursor: { status: 400, title: "The cursor is not valid for this list" },
  unprocessable: { status: 422, title: "The request could not be carried out" },
  confirmation_invalid: { status: 422, title: "The confirmation code is wrong or expired" },
  idempotency_key_reused: { status: 422, title: "This Idempotency-Key was used with a different request" },
  rate_limited: { status: 429, title: "Too many requests" },
  internal: { status: 500, title: "Internal error" },
} as const;

export type ProblemCode = keyof typeof PROBLEMS;

export const docsUrl = () => `${publicUrl().replace(/\/$/, "")}/docs/api`;

export class ApiProblem extends Error {
  constructor(
    public code: ProblemCode,
    public detail?: string,
    public extra: Record<string, unknown> = {},
    public headers: Record<string, string> = {},
  ) {
    super(detail ?? PROBLEMS[code].title);
  }
  get status() { return PROBLEMS[this.code].status; }
}

export function problemBody(p: ApiProblem, instance?: string) {
  const def = PROBLEMS[p.code];
  return {
    type: `${docsUrl()}#error-${p.code.replace(/_/g, "-")}`,
    title: def.title,
    status: def.status,
    code: p.code,
    ...(p.detail ? { detail: p.detail } : {}),
    ...(instance ? { instance } : {}),
    ...p.extra,
  };
}
