import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "./db";
import { isLocale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { requestOrigin } from "./email/url";
import { mcpResource } from "./oauth-uri";

const cors = { "access-control-allow-origin": "*", "cache-control": "public, max-age=300" };

export async function projectFor(slug: string) {
  return /^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) ? db.query.projects.findFirst({ where: eq(schema.projects.slug, slug) }) : undefined;
}

/** RFC 8414 metadata for the project's authorization server (issuer = origin/<slug>). */
export async function asMetadata(req: NextRequest, slug: string) {
  const project = await projectFor(slug);
  if (!project) return new Response("not found", { status: 404 });
  const iss = `${requestOrigin(project, req)}/${slug}`;
  return Response.json({
    issuer: iss,
    authorization_endpoint: `${iss}/oauth/authorize`,
    token_endpoint: `${iss}/oauth/token`,
    // Preferred client registration (MCP 2026-07-28): client_id = https URL of a metadata document.
    client_id_metadata_document_supported: true,
    // Legacy RFC 7591 registration, deprecated by MCP; kept for clients without CIMD.
    registration_endpoint: `${iss}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read", "write", "triage"],
    // RFC 9207: the consent redirect always carries iss (also on errors).
    authorization_response_iss_parameter_supported: true,
  }, { headers: cors });
}

/** RFC 9728 metadata for the MCP resource of one project. */
export async function resourceMetadata(req: NextRequest, slug: string) {
  const project = await projectFor(slug);
  if (!project) return new Response("not found", { status: 404 });
  const origin = requestOrigin(project, req);
  return Response.json({
    resource: mcpResource(origin, slug),
    authorization_servers: [`${origin}/${slug}`],
    scopes_supported: ["read", "write", "triage"],
    bearer_methods_supported: ["header"],
    resource_name: translator(isLocale(project.defaultLocale) ? project.defaultLocale : "sk", "admin")("oauth.resourceName", { name: project.name }),
  }, { headers: cors });
}
