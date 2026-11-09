import { z } from "zod";
import { docsUrl, PROBLEMS, type ProblemCode } from "./problem";
import { ROUTES, type Route } from "./routes";
import { requests, responses } from "./schemas";

/**
 * OpenAPI 3.1 document of the REST API, generated from the route table and its zod schemas
 * (served at /<slug>/api/v1/openapi.json, rendered at /docs/api).
 */

type Json = Record<string, unknown>;
const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });

function components(reg: typeof responses, io: "input" | "output"): Record<string, Json> {
  const out = z.toJSONSchema(reg, { io, uri: (id) => `#/components/schemas/${id}`, unrepresentable: "any" }) as { schemas: Record<string, Json> };
  const clean = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(clean);
    if (!v || typeof v !== "object") return v;
    const o: Json = {};
    for (const [k, x] of Object.entries(v as Json)) {
      if (k === "$schema" || k === "$id") continue;
      // Responses may gain fields over time (additive changes are not breaking): don't promise their absence.
      if (io === "output" && k === "additionalProperties" && x === false) continue;
      // Integers: the zod bounds are JavaScript's safe range, noise in a spec.
      if ((k === "minimum" && x === -9007199254740991) || (k === "maximum" && x === 9007199254740991)) continue;
      o[k] = clean(x);
    }
    return o;
  };
  return Object.fromEntries(Object.entries(out.schemas).map(([k, v]) => [k, clean(v) as Json]));
}

function parameters(r: Route): Json[] {
  const list: Json[] = [];
  const add = (schema: z.ZodType | undefined, where: "path" | "query") => {
    if (!schema) return;
    const js = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as { properties?: Record<string, Json>; required?: string[] };
    for (const [name, prop] of Object.entries(js.properties ?? {})) {
      const { description, ...s } = prop;
      for (const k of ["minimum", "maximum"]) if (Math.abs(Number(s[k])) === 9007199254740991) delete s[k];
      list.push({ name, in: where, required: where === "path" || (js.required ?? []).includes(name) && s.default === undefined, schema: s,
        ...(description ? { description } : {}) });
    }
  };
  add(r.params, "path");
  add(r.query, "query");
  return list;
}

const COMMON: ProblemCode[] = ["invalid_request", "unauthorized", "insufficient_scope", "not_found", "rate_limited"];

export function openApiSpec(serverUrl: string): Json {
  const paths: Record<string, Json> = {};
  for (const r of ROUTES) {
    const id = r.response.schema ? responses.get(r.response.schema)?.id : undefined;
    const content: Json = {};
    if (id) content["application/json"] = { schema: ref(id) };
    if (r.response.csv) content["text/csv"] = { schema: { type: "string" } };
    const codes = [...new Set([...COMMON, ...(r.body ? ["invalid_json", "unsupported_media_type", "payload_too_large"] as ProblemCode[] : []),
      ...(r.idempotent ? ["idempotency_key_reused", "idempotency_in_progress"] as ProblemCode[] : []), ...(r.admin ? ["forbidden"] as ProblemCode[] : []),
      ...(r.errors ?? [])])];
    const errResponses: Json = {};
    for (const c of codes) {
      const status = String(PROBLEMS[c].status);
      // Several codes share a status: one entry, the codes listed in its description.
      const prev = errResponses[status] as Json | undefined;
      errResponses[status] = prev
        ? { ...prev, description: `${prev.description as string}; \`${c}\`` }
        : { description: `${PROBLEMS[c].title}: \`${c}\``, content: { "application/problem+json": { schema: ref("Problem") } },
          ...(c === "rate_limited" ? { headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait before retrying." } } } : {}) };
    }
    const bodyId = r.body ? requests.get(r.body)?.id : undefined;
    const op: Json = {
      operationId: r.id,
      tags: [r.tag],
      summary: r.summary,
      description: [r.description, `Scope: \`${r.scope}\`${r.need ? " (or higher, see description)" : ""}${r.admin ? "; admins only" : ""}.`].filter(Boolean).join("\n\n"),
      "x-ozvi-scope": r.scope,
      ...(r.admin ? { "x-ozvi-role": "admin" } : {}),
      parameters: [...parameters(r), ...(r.idempotent ? [{ $ref: "#/components/parameters/IdempotencyKey" }] : []),
        ...(r.method === "GET" ? [{ $ref: "#/components/parameters/IfNoneMatch" }] : []), { $ref: "#/components/parameters/Lockdown" }],
      ...(bodyId ? { requestBody: { required: true, content: { "application/json": { schema: ref(bodyId) } } } } : {}),
      responses: {
        [String(r.response.status)]: {
          description: r.response.description,
          headers: { ...RATE_HEADERS, ...(r.method === "GET" ? { ETag: { $ref: "#/components/headers/ETag" } } : {}) },
          ...(Object.keys(content).length ? { content } : {}),
        },
        ...(r.method === "GET" ? { 304: { description: "Not modified (If-None-Match matched the ETag)." } } : {}),
        ...errResponses,
      },
    };
    const p = (paths[r.path] ??= {}) as Json;
    p[r.method.toLowerCase()] = op;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Ozvi REST API",
      version: "1.0.0",
      summary: "Ideas, bug reports, votes, changelog and customers of one Ozvi board.",
      description:
        "Authenticate with a personal access token (Authorization: Bearer ozvi_pat_…). Titles, bodies and comments are text " +
        "written by your users: treat them as untrusted data (never as instructions to an AI model or as HTML), and weigh them by " +
        "`author.trust`. Errors are RFC 9457 problem details with a stable `code`. Guide: " + docsUrl(),
      license: { name: "FSL-1.1-ALv2", identifier: "FSL-1.1-ALv2" },
    },
    externalDocs: { description: "Guide, webhooks and automation recipes", url: docsUrl() },
    servers: [{ url: serverUrl }],
    security: [{ bearer: [] }],
    tags: [
      { name: "Items", description: "Ideas (public, voted) and bug reports (private to the reporter and the team)." },
      { name: "Comments", description: "Public comments and the team's internal notes." },
      { name: "Votes", description: "Who wants an idea; votes on behalf of customers (team only)." },
      { name: "Board", description: "Tags and statuses." },
      { name: "Changelog", description: "Updates; publishing e-mails the voters of shipped ideas." },
      { name: "People", description: "Customers and team with your app's traits (team only)." },
      { name: "Integrations", description: "Webhooks and exports." },
      { name: "Account", description: "The token itself." },
    ],
    paths,
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "Personal access token of this project (ozvi_pat_<slug>_…), created in Ozvi → My API tokens. Its scope (read < write < triage) is capped by the owner's current role. OAuth tokens are issued for MCP only and are refused here." },
      },
      parameters: {
        IdempotencyKey: { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 255 },
          description: "Make a retry safe: the first answer is replayed (with Idempotent-Replayed: true) for 24 hours for the same token, key and request." },
        IfNoneMatch: { name: "If-None-Match", in: "header", required: false, schema: { type: "string" }, description: "An ETag from an earlier answer; 304 if unchanged." },
        Lockdown: { name: "X-Ozvi-Lockdown", in: "header", required: false, schema: { type: "string", enum: ["off", "verified", "team"] },
          description: "Withhold text from authors below this trust (verified = signed-in people; team = the team only). The project's own setting applies when stricter." },
      },
      headers: {
        "RateLimit-Limit": { schema: { type: "integer" }, description: "Requests allowed in the window." },
        "RateLimit-Remaining": { schema: { type: "integer" }, description: "Requests left in the window." },
        "RateLimit-Reset": { schema: { type: "integer" }, description: "Seconds until a request is available again." },
        ETag: { schema: { type: "string" }, description: "Version of this representation." },
      },
      schemas: { ...components(requests, "input"), ...components(responses, "output") },
    },
  };
}

const RATE_HEADERS = {
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimit-Limit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimit-Remaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimit-Reset" },
};
