/**
 * Is an AI provider configured? The same reading of the environment as apps/web lib/ai-provider.ts aiConfig(),
 * without its warnings, for the operator CLI (a new board starts with post translation "on request" when it is).
 */
export function aiProviderSet(env: Record<string, string | undefined>): boolean {
  const p = (env.OZVI_AI_PROVIDER ?? "").trim().toLowerCase();
  const key = !!(env.OZVI_AI_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim());
  if (!p) return key;
  if (p === "anthropic" || p === "claude") return key;
  if (p === "openai" || p === "openai-compatible" || p === "openai_compatible") return !!env.OZVI_AI_MODEL?.trim();
  return false;
}
