import { describe, expect, it } from "vitest";
import { aiProviderSet } from "./ai-env";

describe("aiProviderSet (CLI: new boards start with translation on request when AI is set up)", () => {
  it("reads the environment like the web app", () => {
    expect(aiProviderSet({})).toBe(false);
    expect(aiProviderSet({ OZVI_AI_API_KEY: "k" })).toBe(true);
    expect(aiProviderSet({ ANTHROPIC_API_KEY: "k" })).toBe(true);
    expect(aiProviderSet({ OZVI_AI_PROVIDER: "anthropic" })).toBe(false);
    expect(aiProviderSet({ OZVI_AI_PROVIDER: "openai", OZVI_AI_MODEL: "mistral-small" })).toBe(true);
    expect(aiProviderSet({ OZVI_AI_PROVIDER: "openai" })).toBe(false);
    expect(aiProviderSet({ OZVI_AI_PROVIDER: "off", OZVI_AI_API_KEY: "k" })).toBe(false);
    expect(aiProviderSet({ OZVI_AI_PROVIDER: "bogus", OZVI_AI_API_KEY: "k" })).toBe(false);
  });
});
