import { describe, expect, it } from "vitest";
import { BlockedAddressError, blockedCause, checkUrl, safeFetch, urlProblem } from "./net";
import { deliver } from "./webhooks";

describe("static URL check (cloud)", () => {
  it.each([
    "https://localhost/x", "https://localhost./x", "https://foo.localhost/x", "https://foo.localhost./x", "https://foo.localhost../x",
    "https://db.internal./x", "https://intranet./x", "https://127.0.0.1./x",
  ])("%s is internal", (url) => expect(urlProblem(url, "cloud")).toBe("internal"));

  it("a public name with a trailing dot is fine", () => {
    expect(urlProblem("https://hooks.slack.com./services/x", "cloud")).toBeNull();
  });

  it("self-host may target its own network", () => {
    expect(urlProblem("http://localhost./x", "self")).toBeNull();
  });

  it("speaks the admin's language", () => {
    expect(checkUrl("https://foo.localhost./x", "cloud", "sk")).toBe("Adresa nemôže smerovať do internej siete.");
    expect(checkUrl("https://foo.localhost./x", "cloud", "en")).not.toBe(checkUrl("https://foo.localhost./x", "cloud", "sk"));
  });
});

describe("blocked deliveries say why", () => {
  it("finds the blocked reason behind fetch's wrapper error", () => {
    const inner = new BlockedAddressError("internal");
    expect(blockedCause(new TypeError("fetch failed", { cause: inner }))).toBe(inner);
    expect(blockedCause(new Error("other"))).toBeNull();
    expect(inner.text("en")).not.toBe(inner.text("sk"));
  });

  it("safeFetch refuses statically blocked addresses with the reason", async () => {
    await expect(safeFetch("https://foo.localhost./x", {}, "cloud")).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it("a webhook test shows the reason, not \"fetch failed\"", async () => {
    const hook = { id: "h", projectId: "p", url: "https://foo.localhost./x", format: "slack", events: [], includeBugs: false, secretEnc: "", active: true, createdAt: new Date() };
    const payload = { event: "item.created", item: { number: 1, kind: "idea", title: "Test", body: "", status: "open", url: "https://ozvi.test/i/1" } };
    const r = await deliver(hook as never, payload, async () => {
      throw new TypeError("fetch failed", { cause: new BlockedAddressError("internal") });
    }, undefined, "sk");
    expect(r).toMatchObject({ ok: false, error: "Adresa nemôže smerovať do internej siete." });
  });
});
