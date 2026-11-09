import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { confirmCode, createOzviMcpServer, type Backend, type McpUpdate, type Scope } from "./index";

/** Release loop tools: proof on set_status, drafts with AI labels, publish_draft with confirmation. */

const draft: McpUpdate = {
  id: "11111111-1111-4111-8111-111111111111", status: "draft", title: "Verzia 2.15.1", body: "AI text", version: "2.15.1",
  url: "https://x/p/changelog/1/edit", publishedAt: null, updatedAt: "2026-11-08T10:00:00.000Z",
  items: [{ number: 1, kind: "idea", title: "Export" }], ai: { generated: true, model: "claude-opus-5-5", reviewedBy: null },
};

function backend(scope: Scope) {
  return {
    project: { slug: "p", name: "P" }, user: { name: "T", role: scope === "triage" ? "team" : "member" }, scope, lockdown: "off",
    secret: "s".repeat(32), hasGithub: true,
    search: vi.fn(), get: vi.fn(), summary: vi.fn(), similar: vi.fn(), create: vi.fn(), comment: vi.fn(), linkIssue: vi.fn(), createIssue: vi.fn(),
    merge: vi.fn(), previewUpdate: vi.fn(), publishUpdate: vi.fn(), tags: vi.fn(), setTags: vi.fn(), submitInsight: vi.fn(),
    setStatus: vi.fn(async (n: number, status: string) => ({ number: n, status, fixedInVersion: "2.15.1" })),
    listUpdates: vi.fn(async () => [draft]),
    getDraft: vi.fn(async () => ({ ...draft, recipients: 4 })),
    publishDraft: vi.fn(async () => ({ url: "https://x/p/changelog#e-1", emailed: 4 })),
  } as unknown as Backend & { setStatus: ReturnType<typeof vi.fn>; publishDraft: ReturnType<typeof vi.fn> };
}

async function connect(b: Backend) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createOzviMcpServer(b).connect(st);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(ct);
  return client;
}
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text);

describe("release loop tools", () => {
  it("set_status passes proof of the fix to the backend", async () => {
    const b = backend("triage");
    const c = await connect(b);
    const r = await c.callTool({ name: "set_status", arguments: { number: 3, status: "fixed", fixedInVersion: "2.15.1",
      pullRequests: ["https://github.com/acme/app/pull/45"], previewUrl: "https://pr-45.example.com" } });
    expect(text(r)).toContain("proof attached");
    expect(b.setStatus).toHaveBeenCalledWith(3, "fixed", "2.15.1", { pullRequests: ["https://github.com/acme/app/pull/45"], previewUrl: "https://pr-45.example.com" });
  });

  it("list_updates carries the machine-readable AI label; drafts need the triage scope", async () => {
    const c = await connect(backend("triage"));
    const out = text(await c.callTool({ name: "list_updates", arguments: { drafts: true } }));
    expect(out).toContain('"generated": true');
    expect(out).toContain('"model": "claude-opus-5-5"');
    expect(out).toContain('"reviewedBy": null');
    const member = await connect(backend("write"));
    expect((await member.callTool({ name: "list_updates", arguments: { drafts: true } })).isError).toBe(true);
  });

  it("publish_draft previews first and publishes only with the code bound to the draft version", async () => {
    const b = backend("triage");
    const c = await connect(b);
    const preview = text(await c.callTool({ name: "publish_draft", arguments: { id: draft.id } }));
    expect(preview).toContain("written with AI");
    expect(b.publishDraft).not.toHaveBeenCalled();
    expect((await c.callTool({ name: "publish_draft", arguments: { id: draft.id, confirm: "wrong" } })).isError).toBe(true);
    const code = confirmCode("s".repeat(32), "publish_draft", { id: draft.id, updatedAt: draft.updatedAt });
    expect(text(await c.callTool({ name: "publish_draft", arguments: { id: draft.id, confirm: code } }))).toContain("4 e-mail(s)");
    expect(b.publishDraft).toHaveBeenCalledTimes(1);
  });
});
