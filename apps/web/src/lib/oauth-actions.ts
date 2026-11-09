"use server";

import type { Scope } from "@ozvi/mcp";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestOrigin } from "./email/url";
import { findClient, issueCode, maxScope, upsertCimdClient } from "./oauth";
import { isCimdClientId, resolveClientMetadata } from "./oauth-cimd";
import { getTranslations } from "next-intl/server";
import { getCtx } from "./project";
import { effectiveScope } from "./tokens";

export interface AuthorizeParams { clientId: string; redirectUri: string; state: string; challenge: string }

const RANK: Record<Scope, number> = { read: 0, write: 1, triage: 2 };

/** The consent decision. Everything is re-validated here: the page's hidden fields are user-controlled. */
export async function decideOAuth(slug: string, p: AuthorizeParams, form: FormData) {
  const { project, user, locale } = await getCtx(slug);
  const t = await getTranslations({ locale, namespace: "admin.oauth" });
  if (!user) throw new Error(t("signInAgain"));
  if (!/^[A-Za-z0-9_-]{43}$/.test(p.challenge)) throw new Error(t("invalid"));
  // CIMD: re-check against the (cached) document; the client row is only written on consent.
  const meta = isCimdClientId(p.clientId) ? await resolveClientMetadata(p.clientId).catch(() => null) : undefined;
  if (meta === null || (meta && !meta.redirectUris.includes(p.redirectUri))) throw new Error(t("invalid"));
  const client = meta ? null : await findClient(project, p.clientId);
  if (!meta && (!client || !client.redirectUris.includes(p.redirectUri))) throw new Error(t("invalid"));
  const back = new URL(p.redirectUri);
  if (p.state) back.searchParams.set("state", p.state);
  const h = await headers();
  // RFC 9207: must equal the metadata's issuer, which is built from the request origin the same way.
  const reqOrigin = `${h.get("x-forwarded-proto")?.split(",")[0] ?? "http"}://${h.get("host")}`;
  back.searchParams.set("iss", `${requestOrigin(project, { headers: h, nextUrl: { origin: reqOrigin } })}/${slug}`);
  if (form.get("decision") !== "allow") {
    back.searchParams.set("error", "access_denied");
    redirect(back.toString());
  }
  const asked = String(form.get("scope") ?? "read") as Scope;
  const cap = maxScope(user);
  const scope = effectiveScope(RANK[asked] !== undefined && RANK[asked] <= RANK[cap] ? asked : "read", user.role);
  const clientDbId = meta ? (await upsertCimdClient(project, meta)).id : client!.id;
  back.searchParams.set("code", await issueCode(project, user, { clientDbId, redirectUri: p.redirectUri, challenge: p.challenge, scope }));
  redirect(back.toString());
}
