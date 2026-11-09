import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/**
 * Which model provider writes Ozvi's AI drafts. Operator config only (environment), never project
 * or user input: the base URL is trusted because only whoever runs the server can set it.
 *
 *   OZVI_AI_PROVIDER   anthropic | openai (any OpenAI-compatible API) | off
 *   OZVI_AI_API_KEY    key (optional for local servers such as Ollama, vLLM, LM Studio)
 *   OZVI_AI_BASE_URL   default https://api.anthropic.com / https://api.openai.com/v1
 *   OZVI_AI_MODEL      required for openai; default claude-opus-5-5 for anthropic
 *   OZVI_AI_MODEL_FAST optional cheaper model for translations and title pivots (default OZVI_AI_MODEL)
 *
 * Legacy: ANTHROPIC_API_KEY alone still means provider=anthropic (with a one-time hint).
 */

export type AiProvider = "anthropic" | "openai";

export interface AiConfig {
  provider: AiProvider;
  apiKey?: string;
  /** Without trailing slash; undefined = the SDK default (Anthropic). */
  baseUrl?: string;
  model: string;
  modelFast: string;
}

/** Same set as AiError codes in ai.ts (kept here so the adapters do not import the i18n layer). */
export type ProviderErrorCode = "overloaded" | "auth" | "failed" | "refused" | "empty";

export class ProviderError extends Error {
  constructor(public readonly code: ProviderErrorCode, public readonly status?: number) {
    super(`ai provider: ${code}${status ? ` ${status}` : ""}`);
  }
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
export const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

const warned = new Set<string>();
function warnOnce(key: string, msg: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[ozvi] ${msg}`);
}

const clean = (v: string | undefined) => (v ?? "").trim() || undefined;

/** Resolves the AI config from the environment; null = AI off (everything still works without it). */
export function aiConfig(env: Record<string, string | undefined> = process.env): AiConfig | null {
  const raw = clean(env.OZVI_AI_PROVIDER)?.toLowerCase();
  const key = clean(env.OZVI_AI_API_KEY);
  const legacyKey = clean(env.ANTHROPIC_API_KEY);
  const baseUrl = clean(env.OZVI_AI_BASE_URL)?.replace(/\/+$/, "");
  const model = clean(env.OZVI_AI_MODEL);
  const fast = clean(env.OZVI_AI_MODEL_FAST);

  if (raw === "off" || raw === "none" || raw === "false") return null;
  let provider: AiProvider;
  if (raw === undefined) {
    if (!key && !legacyKey) return null;
    provider = "anthropic";
  } else if (raw === "anthropic" || raw === "claude") {
    provider = "anthropic";
  } else if (raw === "openai" || raw === "openai-compatible" || raw === "openai_compatible") {
    provider = "openai";
  } else {
    warnOnce(`provider:${raw}`, `OZVI_AI_PROVIDER="${raw}" is not anthropic, openai or off — AI is off.`);
    return null;
  }

  if (provider === "anthropic") {
    const apiKey = key ?? legacyKey;
    if (!apiKey) {
      warnOnce("anthropic:key", "OZVI_AI_PROVIDER=anthropic needs OZVI_AI_API_KEY — AI is off.");
      return null;
    }
    if (!key && !raw) warnOnce("legacy", "ANTHROPIC_API_KEY is deprecated: set OZVI_AI_PROVIDER=anthropic and OZVI_AI_API_KEY instead (docs/SELFHOST.md).");
    const m = model ?? DEFAULT_ANTHROPIC_MODEL;
    return { provider, apiKey, baseUrl, model: m, modelFast: fast ?? m };
  }

  if (!model) {
    warnOnce("openai:model", "OZVI_AI_PROVIDER=openai needs OZVI_AI_MODEL (e.g. gpt-4o-mini, mistral-small-latest, llama3.1) — AI is off.");
    return null;
  }
  return { provider, apiKey: key, baseUrl: baseUrl ?? DEFAULT_OPENAI_BASE, model, modelFast: fast ?? model };
}

/** Human/admin-facing provider name (privacy texts, settings hints). */
export function aiProviderName(cfg: AiConfig | null = aiConfig()): string | null {
  if (!cfg) return null;
  if (cfg.provider === "anthropic") return "Anthropic";
  try { return new URL(cfg.baseUrl ?? DEFAULT_OPENAI_BASE).host; } catch { return "OpenAI-compatible API"; }
}

/* ── Requests ──────────────────────────────────────────────────────────────────────────────────── */

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens: number;
  /** Which configured model: main (summaries, drafts) or fast (translations, pivots). */
  tier?: "main" | "fast";
}

export interface JsonRequest<T> extends CompletionRequest {
  /** JSON Schema sent to providers that support structured output. */
  schema: Record<string, unknown>;
  /** Validates the answer (always, also when the provider promised to follow the schema). */
  validate: z.ZodType<T>;
}

export const modelFor = (cfg: AiConfig, tier: "main" | "fast" = "main") => (tier === "fast" ? cfg.modelFast : cfg.model);

export async function completeText(cfg: AiConfig, req: CompletionRequest, deps: AdapterDeps = {}): Promise<string> {
  const text = cfg.provider === "anthropic" ? await anthropicCall(cfg, req) : await openaiCall(cfg, req, null, deps);
  const out = stripThinking(text).trim();
  if (!out) throw new ProviderError("empty");
  return out;
}

export async function completeJson<T>(cfg: AiConfig, req: JsonRequest<T>, deps: AdapterDeps = {}): Promise<T> {
  const text = cfg.provider === "anthropic" ? await anthropicCall(cfg, req, req.schema) : await openaiCall(cfg, req, req.schema, deps);
  const parsed = extractJson(stripThinking(text));
  const ok = parsed === undefined ? null : req.validate.safeParse(parsed);
  if (!ok?.success) throw new ProviderError("empty");
  return ok.data;
}

/** Reasoning models served locally (DeepSeek-R1, Qwen3 on Ollama) put their thinking in <think>. */
export const stripThinking = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/gi, "");

/** Tolerant JSON: plain, fenced ```json, or the outermost {...} inside prose. undefined when none parses. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const tries = [t, t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]];
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) {
    if (!s) continue;
    try { return JSON.parse(s); } catch { /* next */ }
  }
  return undefined;
}

/* ── Anthropic (official SDK) ───────────────────────────────────────────────────────────────────── */

let anthropicClient: { key: string; client: Anthropic } | undefined;
function anthropic(cfg: AiConfig): Anthropic {
  const key = `${cfg.apiKey}|${cfg.baseUrl ?? ""}`;
  if (anthropicClient?.key !== key) {
    anthropicClient = { key, client: new Anthropic({ apiKey: cfg.apiKey, ...(cfg.baseUrl && { baseURL: cfg.baseUrl }), timeout: 90_000, maxRetries: 2 }) };
  }
  return anthropicClient.client;
}

async function anthropicCall(cfg: AiConfig, req: CompletionRequest, schema?: Record<string, unknown>): Promise<string> {
  let res;
  try {
    res = await anthropic(cfg).beta.messages.create({
      model: modelFor(cfg, req.tier),
      max_tokens: req.maxTokens,
      // Routine work: low effort keeps it fast and cheap.
      output_config: schema ? { effort: "low", format: { type: "json_schema", schema } } : { effort: "low" },
      // On a policy decline the API retries on a suitable fallback model within the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError("overloaded", 429);
    if (e instanceof Anthropic.AuthenticationError) throw new ProviderError("auth", 401);
    if (e instanceof Anthropic.APIError) throw new ProviderError("failed", e.status ?? undefined);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new ProviderError("refused");
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join(schema ? "" : "\n");
}

/* ── OpenAI-compatible (plain fetch to /chat/completions) ──────────────────────────────────────── */

export interface AdapterDeps { fetch?: typeof fetch; timeoutMs?: number }

type JsonMode = "schema" | "object" | "none";
/** Per base+model: the strongest JSON mode the server accepted (remembered so we pay a 400 once). */
const jsonModes = new Map<string, JsonMode>();
export const _resetJsonModes = () => jsonModes.clear();

interface ChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[];
}

async function openaiCall(cfg: AiConfig, req: CompletionRequest, schema: Record<string, unknown> | null, deps: AdapterDeps): Promise<string> {
  const doFetch = deps.fetch ?? fetch;
  const model = modelFor(cfg, req.tier);
  const modeKey = `${cfg.baseUrl}|${model}`;
  let mode: JsonMode = schema ? jsonModes.get(modeKey) ?? "schema" : "none";
  let tokensField: "max_tokens" | "max_completion_tokens" = "max_tokens";

  for (let attempt = 0; attempt < 4; attempt++) {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
      [tokensField]: req.maxTokens,
    };
    if (mode === "schema") body.response_format = { type: "json_schema", json_schema: { name: "ozvi_result", strict: true, schema } };
    else if (mode === "object") body.response_format = { type: "json_object" };

    let res: Response;
    try {
      res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(cfg.apiKey && { authorization: `Bearer ${cfg.apiKey}` }) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(deps.timeoutMs ?? 90_000),
        redirect: "error",
      });
    } catch {
      throw new ProviderError("failed"); // network error or timeout
    }

    if (res.status === 400 || res.status === 422) {
      const detail = (await res.text().catch(() => "")).slice(0, 2000);
      // Newer OpenAI models reject max_tokens; most other servers only know max_tokens.
      if (tokensField === "max_tokens" && /max_completion_tokens/.test(detail)) { tokensField = "max_completion_tokens"; continue; }
      // No structured output on this server/model: fall back to json_object, then to plain text + validation.
      if (mode === "schema") { mode = "object"; jsonModes.set(modeKey, mode); continue; }
      if (mode === "object") { mode = "none"; jsonModes.set(modeKey, mode); continue; }
      throw new ProviderError("failed", res.status);
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth", res.status);
    if (res.status === 429 || res.status === 503 || res.status === 529) throw new ProviderError("overloaded", res.status);
    if (!res.ok) throw new ProviderError("failed", res.status);

    let json: ChatResponse;
    try { json = (await res.json()) as ChatResponse; } catch { throw new ProviderError("empty"); }
    const choice = json?.choices?.[0];
    if (choice?.message?.refusal || choice?.finish_reason === "content_filter") throw new ProviderError("refused");
    const content = choice?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new ProviderError("empty");
    return content;
  }
  throw new ProviderError("failed");
}
