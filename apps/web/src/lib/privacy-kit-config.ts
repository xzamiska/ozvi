import { cookieName, MAX_AGE as SESSION_MAX_AGE } from "./session-core";
import { flowCookieName } from "./oidc";
import { aiProviderName } from "./ai-provider";
import { CSV_SEP_KEY, LOCALE_MAX_AGE, OIDC_FLOW_MAX_AGE, WIDGET_SEEN_PREFIX } from "./storage-keys";
import { LOCALE_COOKIE } from "@/i18n/locales";
import type { AiRecipient, KitConfig, StorageItem } from "./privacy-kit";
import { DEFAULT_CAPTURE } from "./privacy-kit";

/** Server side of the privacy kit: the facts about one project and this instance (env), never secrets. */

type Env = Record<string, string | undefined>;

const hostOf = (url: string | undefined | null) => {
  if (!url) return null;
  try { return new URL(url).hostname || null; } catch { return null; }
};

/** Hosts that are the operator's own machine or network: a model there is not a third-party recipient. */
export function isPrivateHost(h: string): boolean {
  const host = h.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  if (!host.includes(".") && !host.includes(":")) return true; // docker service name (ollama, vllm)
  if (host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host)) return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127);
}

/**
 * Who receives text for the AI features. Cloud: Scaleway (our sub-processor, EU; the kit lists it). Self-host: the provider
 * the operator configured (aiProviderName(): "Anthropic", an API host such as api.mistral.ai, or a host on the
 * operator's own network such as ollama:11434 = a local model, no third party). Takes the name so tests can stub it.
 */
export function aiRecipient(mode: "cloud" | "self", name: string | null = aiProviderName()): AiRecipient {
  if (mode === "cloud" || name === "Anthropic") return { kind: "anthropic" };
  if (!name || !/^[\w.:\[\]-]+$/.test(name)) return { kind: "remote", host: null };
  const host = name.startsWith("[") ? name.slice(0, name.indexOf("]") + 1) : name.split(":")[0]!;
  return isPrivateHost(host) ? { kind: "local" } : { kind: "remote", host: name };
}

/** Everything Ozvi keeps in a visitor's browser for this project (board cookies, widget storage). */
export function browserStorage(slug: string, origin: string, oidc: boolean): StorageItem[] {
  return [
    { name: `${WIDGET_SEEN_PREFIX}${origin}|${slug}|<user ID>`, where: "widget", type: "local", purpose: "seen", maxAge: null },
    { name: cookieName(slug), where: "board", type: "cookieHttpOnly", purpose: "session", maxAge: SESSION_MAX_AGE },
    ...(oidc ? [{ name: flowCookieName(slug), where: "board", type: "cookieHttpOnly", purpose: "oidc", maxAge: OIDC_FLOW_MAX_AGE } as const] : []),
    { name: LOCALE_COOKIE, where: "board", type: "cookie", purpose: "locale", maxAge: LOCALE_MAX_AGE },
    { name: CSV_SEP_KEY, where: "boardTeam", type: "local", purpose: "csv", maxAge: null },
  ];
}

export interface KitFacts {
  project: {
    slug: string; name: string; ssoSecretEnc: string | null; emailLogin: boolean; oidcIssuer: string | null; translationMode: string;
    retentionCaptureDays: number | null; retentionClosedFilesDays: number | null; retentionContactsMonths: number | null;
  };
  origin: string;
  aiOn: boolean;
  integrations: KitConfig["integrations"];
  operator: string;
  publicUrl: string;
}

export function kitConfig(f: KitFacts, env: Env = process.env, ai: (mode: "cloud" | "self") => AiRecipient = (m) => aiRecipient(m)): KitConfig {
  const mode = env.OZVI_MODE === "cloud" ? "cloud" : "self";
  const p = f.project;
  const smtp = hostOf(env.SMTP_URL);
  return {
    mode,
    name: p.name,
    boardUrl: `${f.origin.replace(/\/$/, "")}/${p.slug}`,
    signIn: { sso: !!p.ssoSecretEnc, email: p.emailLogin, oidc: p.oidcIssuer ? hostOf(p.oidcIssuer) ?? p.oidcIssuer : null },
    ai: f.aiOn ? { recipient: ai(mode), translation: p.translationMode !== "off" } : null,
    integrations: f.integrations,
    mail: mode === "cloud" ? { kind: "cloud" } : env.ECOMAIL_API_KEY ? { kind: "ecomail" } : smtp ? { kind: "smtp", host: smtp } : { kind: "none" },
    s3: mode === "self" && env.S3_ENDPOINT && env.S3_BUCKET ? hostOf(env.S3_ENDPOINT) : null,
    embeddings: mode === "self" && env.OZVI_EMBEDDINGS_URL && env.OZVI_EMBEDDINGS_MODEL && !isPrivateHost(hostOf(env.OZVI_EMBEDDINGS_URL) ?? "localhost") ? hostOf(env.OZVI_EMBEDDINGS_URL) : null,
    retention: { captureDays: p.retentionCaptureDays, closedFilesDays: p.retentionClosedFilesDays, contactsMonths: p.retentionContactsMonths },
    operator: mode === "cloud" && !f.operator.startsWith("[") ? f.operator : null,
    subprocessorsUrl: `${f.publicUrl.replace(/\/$/, "")}/subprocessors`,
    storage: browserStorage(p.slug, f.origin.replace(/\/$/, ""), !!p.oidcIssuer),
    capture: { ...DEFAULT_CAPTURE },
  };
}
