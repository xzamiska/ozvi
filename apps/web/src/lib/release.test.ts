import { createDb, encryptSecret, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const { cleanProofUrl, parsePrBody, prRef, readProof, visibleProof } = await import("./proof");
const { releaseDraftTemplate, createReleaseDraft, enrichReleaseDraft, listUnannounced, countUnannounced } = await import("./release");
const { handleGithubEvent, getGithub } = await import("./github");
const { publishEntry, aiLabel, saveEntry } = await import("./changelog");
const { mcpUpdates } = await import("./release-mcp");
const { statusMails, proofLinks } = await import("./email/notify");
const { translator } = await import("@/i18n/messages");

describe("proof helpers", () => {
  it("accepts only https URLs (http only on localhost)", () => {
    expect(cleanProofUrl("https://preview.example.com/x")).toBe("https://preview.example.com/x");
    expect(cleanProofUrl("http://example.com")).toBeNull();
    expect(cleanProofUrl("javascript:alert(1)")).toBeNull();
    expect(cleanProofUrl("https://user:pw@example.com")).toBeNull();
    expect(cleanProofUrl("http://app.localhost:3000/x")).toBe("http://app.localhost:3000/x");
    expect(prRef("https://github.com/acme/app/pull/45")).toBe("acme/app#45");
    expect(prRef("https://github.com/acme/app/issues/45")).toBeNull();
  });

  it("reads Ozvi markers, closing keywords and the preview line from a PR body", () => {
    const r = parsePrBody("Fix PDF fonts\n\nFixes #40, closes acme/app#41\nresolves https://github.com/acme/app/issues/42\nfixes other/repo#99\nOzvi: #12, #13\nOzvi-Preview: https://pr-45.preview.example.com", "acme/app");
    expect(r.items).toEqual([12, 13]);
    expect(r.issues.sort()).toEqual([40, 41, 42]);
    expect(r.preview).toBe("https://pr-45.preview.example.com/");
    expect(parsePrBody("Ozvi-Preview: javascript:alert(1)", "a/b").preview).toBeNull();
  });

  it("never trusts the stored shape and hides PRs of public ideas from non-team viewers", () => {
    expect(readProof({ prs: [{ url: "javascript:x" }], preview: "ftp://x" })).toBeNull();
    const p = readProof({ prs: [{ url: "https://github.com/a/b/pull/1", title: "T", ref: "a/b#1" }], release: { tag: "2.0", url: "https://github.com/a/b/releases/tag/v2.0" } })!;
    expect(p.prs).toHaveLength(1);
    expect(visibleProof(p, "idea", false)?.prs).toEqual([]);
    expect(visibleProof(p, "bug", false)?.prs).toHaveLength(1);
    expect(visibleProof(p, "idea", true)?.prs).toHaveLength(1);
  });

  it("puts the proof into the reporter's 'fixed' e-mail", () => {
    const t = translator("en", "email");
    const item = { title: "PDF without diacritics", status: "fixed", fixedInVersion: "2.15.1", number: 3, kind: "bug" } as Parameters<typeof statusMails.bugReporter>[2];
    const proof = { prs: [{ url: "https://github.com/acme/app/pull/45", title: "Embed fonts in PDF", ref: "acme/app#45" }], release: { tag: "2.15.1", url: "https://github.com/acme/app/releases/tag/v2.15.1" }, preview: "https://pr-45.example.com/" };
    const m = statusMails.bugReporter(t, "en", item, "https://x/i/3", undefined, proof);
    expect(m.links?.items.map((l) => l.href)).toEqual(["https://pr-45.example.com/", "https://github.com/acme/app/pull/45", "https://github.com/acme/app/releases/tag/v2.15.1"]);
    expect(proofLinks(t, null)).toBeUndefined();
  });

  it("drafts a deterministic entry that never names private bugs", () => {
    const d = releaseDraftTemplate("sk", { tag: "2.15.1", slug: "acme", ideas: [{ number: 12, title: "Export do [Pohody]" }], bugs: 3 });
    expect(d.title).toBe("Verzia 2.15.1");
    expect(d.body).toContain("- [Export do Pohody](/acme/i/12)");
    expect(d.body).toContain("3 nahlásené chyby");
    const onlyBugs = releaseDraftTemplate("en", { tag: "3.0", slug: "acme", ideas: [], bugs: 1 });
    expect(onlyBugs.body).toContain("Version 3.0 fixes 1 reported bug.");
  });

  it("labels AI text machine-readably", () => {
    expect(aiLabel({ aiModel: null, reviewedAt: null }, null)).toBeNull();
    expect(aiLabel({ aiModel: "claude-opus-5-5", reviewedAt: null }, "Eva")).toEqual({ generated: true, model: "claude-opus-5-5", reviewedBy: null, reviewedAt: null });
    const at = new Date("2026-11-08T10:00:00Z");
    expect(aiLabel({ aiModel: "claude-opus-5-5", reviewedAt: at }, "Eva")).toMatchObject({ generated: true, reviewedBy: "Eva", reviewedAt: at.toISOString() });
  });
});

// Integration against the dev database (skipped without it). Unique slug and recipients per run:
// the dev server's e-mail worker may pick these rows up, so the tests only read what they enqueued.
const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `rel-${Date.now()}`;
const mail = (who: string) => `${who}+${slug}@x.test`;
type Row<T extends keyof typeof schema> = (typeof schema)[T] extends { $inferSelect: infer R } ? R : never;
let project: Row<"projects">;
let team: Row<"users">;
let reporter: Row<"users">;
let voter: Row<"users">;
let idea: Row<"items">;
let bug: Row<"items">;

const release = (tag: string) => ({
  action: "published",
  release: { tag_name: tag, name: null, html_url: `https://github.com/acme/app/releases/tag/${tag}`, published_at: new Date().toISOString(), prerelease: false, draft: false, body: "Fonts in PDF; Pohoda export." },
  repository: { full_name: "acme/app" },
});
const closeIssue = (n: number) => ({ action: "closed", issue: { number: n, html_url: "", title: "t", state: "closed", closed_at: new Date(Date.now() - 60_000).toISOString(), state_reason: "completed" }, repository: { full_name: "acme/app" } });
const mailsOf = (kind: string) => withProject(db, project.id, (tx) => tx.select().from(schema.emails).where(eq(schema.emails.kind, kind)));
const github = (event: string, payload: unknown, opts = {}) => withProject(db, project.id, async (tx) => handleGithubEvent(tx, project, (await getGithub(tx))!, event, payload, opts));

describe.skipIf(!up)("release-driven loop", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Release" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Release test", theme: presets.ozvi, itemSeq: 3 }).returning())[0]!;
      [team, reporter, voter] = (await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "t", name: "Eva Tímová", email: mail("team"), role: "team" },
        { projectId: project.id, externalId: "r", name: "Reportér", email: mail("reporter") },
        { projectId: project.id, externalId: "v", name: "Hlasujúci", email: mail("voter") },
      ]).returning()) as [typeof team, typeof team, typeof team];
      [idea, bug] = (await tx.insert(schema.items).values([
        { projectId: project.id, kind: "idea", number: 1, title: "Export do Pohody", status: "planned", authorId: team.id, voteCount: 1 },
        { projectId: project.id, kind: "bug", number: 2, title: "Tajné: PDF u klienta Novák bez diakritiky", status: "confirmed", authorId: reporter.id },
      ]).returning()) as [typeof idea, typeof idea];
      await tx.insert(schema.votes).values({ projectId: project.id, itemId: idea.id, userId: voter.id });
      await tx.insert(schema.webhooks).values({ projectId: project.id, url: "https://hooks.example.com/x", secretEnc: encryptSecret("s"), includeBugs: true });
      await tx.insert(schema.integrations).values({ projectId: project.id, provider: "github", config: { repo: "acme/app", onClose: "release" }, tokenEnc: encryptSecret("ghp_x"), webhookSecretEnc: encryptSecret("gh") });
      await tx.insert(schema.itemLinks).values([
        { projectId: project.id, itemId: idea.id, provider: "github", ref: "acme/app#30", url: "https://github.com/acme/app/issues/30" },
        { projectId: project.id, itemId: bug.id, provider: "github", ref: "acme/app#40", url: "https://github.com/acme/app/issues/40" },
      ]);
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("a merged PR attaches proof to the items it names or whose issue it closes", async () => {
    const pr = { action: "closed", pull_request: { number: 45, html_url: "https://github.com/acme/app/pull/45", title: "Embed fonts in PDF export", body: "Fixes #40\n\nOzvi-Preview: https://pr-45.preview.example.com", merged: true, merged_at: new Date().toISOString() }, repository: { full_name: "acme/app" } };
    expect(await github("pull_request", pr)).toBe("pr acme/app#45: 1 item(s)");
    expect(await github("pull_request", { ...pr, pull_request: { ...pr.pull_request, merged: false } })).toBe("ignored");
    const proofs = await withProject(db, project.id, (tx) => tx.select().from(schema.itemProofs).where(eq(schema.itemProofs.itemId, bug.id)));
    expect(proofs.map((p) => p.kind).sort()).toEqual(["pr", "preview"]);
    expect(proofs.find((p) => p.kind === "pr")).toMatchObject({ ref: "acme/app#45", title: "Embed fonts in PDF export" });
  });

  it("release → bug fixed with proof, idea shipped (author told, voters not), one draft for the team, nothing published", async () => {
    await github("issues", closeIssue(30));
    await github("issues", closeIssue(40));
    const drafted: string[] = [];
    expect(await github("release", release("v2.15.1"), { ai: false, onDraft: (id: string) => drafted.push(id) })).toBe("release 2.15.1: 2 item(s), draft");
    expect(drafted).toHaveLength(1);

    const [ev] = await withProject(db, project.id, (tx) => tx.select().from(schema.itemEvents).where(and(eq(schema.itemEvents.itemId, bug.id), eq(schema.itemEvents.toStatus, "fixed"))));
    expect(readProof(ev!.proof)).toMatchObject({ prs: [{ ref: "acme/app#45" }], release: { tag: "2.15.1", url: "https://github.com/acme/app/releases/tag/v2.15.1" }, preview: "https://pr-45.preview.example.com/" });

    // The reporter's "works for you?" mail carries the evidence.
    const [m] = (await mailsOf("bug_status")).filter((x) => x.to === mail("reporter"));
    expect(m!.html).toContain("Embed fonts in PDF export");
    expect(m!.html).toContain("https://pr-45.preview.example.com/");
    expect(m!.text).toContain("https://github.com/acme/app/releases/tag/v2.15.1");
    // The idea's author gets the normal status mail; the voter hears nothing until the changelog is published.
    expect((await mailsOf("idea_status")).map((x) => x.to)).toEqual([mail("team")]);
    expect((await mailsOf("changelog")).length).toBe(0);

    const entry = await withProject(db, project.id, (tx) => tx.query.changelogEntries.findFirst({ where: eq(schema.changelogEntries.id, drafted[0]!) }));
    expect(entry).toMatchObject({ title: "Verzia 2.15.1", releaseTag: "2.15.1", publishedAt: null, aiModel: null, aiPending: false });
    expect(entry!.body).toContain(`[Export do Pohody](/${slug}/i/1)`);
    expect(entry!.body).not.toContain("Novák");
    const linked = await withProject(db, project.id, (tx) => tx.select().from(schema.changelogItems).where(eq(schema.changelogItems.entryId, entry!.id)));
    expect(linked).toHaveLength(2);
    const teamMail = await mailsOf("release_draft");
    expect(teamMail.map((x) => x.to)).toEqual([mail("team")]);
    expect(teamMail[0]!.subject).toBe("Návrh novinky pre 2.15.1 čaká na schválenie");

    // GitHub redelivers: no second draft.
    expect(await github("release", release("v2.15.1"))).toBe("release 2.15.1: 0 item(s)");
  });

  it("shipped-but-unannounced lists both items until an entry is published", async () => {
    const rows = await withProject(db, project.id, (tx) => listUnannounced(tx));
    expect(rows.map((r) => r.number).sort()).toEqual([1, 2]);
    expect(rows.every((r) => r.inDraft)).toBe(true);
  });

  it("publishing the draft e-mails the voter once, records the reviewer and emits changelog.published", async () => {
    const entry = (await withProject(db, project.id, (tx) => tx.query.changelogEntries.findFirst({ where: eq(schema.changelogEntries.releaseTag, "2.15.1") })))!;
    const r = await withProject(db, project.id, (tx) => publishEntry(tx, project, team, entry.id));
    expect(r.emailed).toBe(1);
    expect(r.entry.reviewedById).toBe(team.id);
    expect((await mailsOf("changelog")).map((x) => x.to)).toEqual([mail("voter")]);
    // Publishing twice does nothing.
    expect((await withProject(db, project.id, (tx) => publishEntry(tx, project, team, entry.id))).emailed).toBe(0);
    expect((await mailsOf("changelog")).length).toBe(1);
    const hooks = await withProject(db, project.id, (tx) => tx.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.event, "changelog.published")));
    expect(hooks).toHaveLength(1);
    const payload = hooks[0]!.payload as { ai: unknown; entry: { ideas: { number: number }[]; version: string } };
    expect(payload.ai).toEqual({ generated: false });
    expect(payload.entry.version).toBe("2.15.1");
    expect(payload.entry.ideas.map((i) => i.number)).toEqual([1]); // bugs never leave through the changelog
    expect(await withProject(db, project.id, (tx) => countUnannounced(tx))).toBe(0);
  });

  it("with AI: the draft waits for Claude (mocked), gets AI text + our item list, and an AI label everywhere", async () => {
    const ids = await withProject(db, project.id, async (tx) => {
      const [i] = await tx.insert(schema.items).values({ projectId: project.id, kind: "idea", number: 3, title: "Tmavý režim", status: "in_progress", authorId: team.id }).returning();
      const [b] = await tx.insert(schema.items).values({ projectId: project.id, kind: "bug", number: 4, title: "Súkromný názov chyby", status: "new", authorId: reporter.id }).returning();
      await tx.insert(schema.itemLinks).values([
        { projectId: project.id, itemId: i!.id, provider: "github", ref: "acme/app#50", url: "https://github.com/acme/app/issues/50" },
        { projectId: project.id, itemId: b!.id, provider: "github", ref: "acme/app#51", url: "https://github.com/acme/app/issues/51" },
      ]);
      return { idea: i!.id };
    });
    await github("issues", closeIssue(50));
    await github("issues", closeIssue(51));
    const drafted: { id: string; notes: string }[] = [];
    await github("release", release("v3.0.0"), { ai: true, onDraft: (id: string, notes: string) => drafted.push({ id, notes }) });
    const id = drafted[0]!.id;
    expect(drafted[0]!.notes).toBe("Fonts in PDF; Pohoda export.");
    expect((await withProject(db, project.id, (tx) => tx.query.changelogEntries.findFirst({ where: eq(schema.changelogEntries.id, id) })))!.aiPending).toBe(true);

    const claude = vi.fn(async () => ({ title: "Verzia 3.0.0 prináša tmavý režim", body: "Konečne aj v noci." }));
    expect(await enrichReleaseDraft(db, project, id, drafted[0]!.notes, claude)).toBe(true);
    const input = (claude.mock.calls[0] as unknown[])[0] as { version: string; ideas: { title: string }[]; fixedBugs: number };
    expect(input.version).toBe("3.0.0");
    expect(input.ideas.map((i) => i.title)).toEqual(["Tmavý režim"]);
    expect(input.fixedBugs).toBe(1);
    expect(JSON.stringify(input)).not.toContain("Súkromný"); // private bug titles never reach the model
    const e = (await withProject(db, project.id, (tx) => tx.query.changelogEntries.findFirst({ where: eq(schema.changelogEntries.id, id) })))!;
    expect(e).toMatchObject({ title: "Verzia 3.0.0 prináša tmavý režim", aiPending: false, publishedAt: null });
    expect(e.aiModel).toBeTruthy();
    expect(e.body).toBe(`Konečne aj v noci.\n\n- [Tmavý režim](/${slug}/i/3)`);
    // A second run does nothing (no longer pending), never auto-publishes.
    expect(await enrichReleaseDraft(db, project, id, "", claude)).toBe(false);

    // Draft in MCP: AI-generated, not reviewed yet.
    const [draft] = await withProject(db, project.id, (tx) => mcpUpdates(tx, project, true, 5, id));
    expect(draft!.ai).toEqual({ generated: true, model: e.aiModel, reviewedBy: null, reviewedAt: null });
    expect(draft!.status).toBe("draft");
    // Published entries are invisible as drafts to non-team listings.
    expect((await withProject(db, project.id, (tx) => mcpUpdates(tx, project, false, 50))).some((u) => u.id === id)).toBe(false);

    await withProject(db, project.id, (tx) => publishEntry(tx, project, team, id));
    const [pub] = await withProject(db, project.id, (tx) => mcpUpdates(tx, project, false, 5, id));
    expect(pub!.ai).toMatchObject({ generated: true, reviewedBy: "Eva Tímová" });
    expect(pub!.items.map((i) => i.kind)).toEqual(["idea"]);
    const [hook] = await withProject(db, project.id, (tx) => tx.select().from(schema.webhookDeliveries)
      .where(and(eq(schema.webhookDeliveries.event, "changelog.published"), sql`${schema.webhookDeliveries.payload}->'entry'->>'version' = '3.0.0'`)));
    expect((hook!.payload as { ai: unknown }).ai).toMatchObject({ generated: true, reviewedBy: "Eva Tímová" });
    expect(ids.idea).toBeTruthy();
  });

  it("AI failure keeps the template; a team edit wins over a late AI rewrite", async () => {
    const make = (tag: string) => withProject(db, project.id, async (tx) => {
      const [i] = await tx.insert(schema.items).values({ projectId: project.id, kind: "idea", number: tag === "4.0" ? 5 : 6, title: `Nápad ${tag}`, status: "planned" }).returning();
      return createReleaseDraft(tx, project, { tag, url: null }, [i!], { ai: true });
    });
    const failing = await make("4.0");
    expect(await enrichReleaseDraft(db, project, failing!, "", async () => { throw new Error("overloaded"); })).toBe(false);
    const f = (await withProject(db, project.id, (tx) => tx.query.changelogEntries.findFirst({ where: eq(schema.changelogEntries.id, failing!) })))!;
    expect(f).toMatchObject({ title: "Verzia 4.0", aiPending: false, aiModel: null });

    const edited = await make("4.1");
    await withProject(db, project.id, (tx) => saveEntry(tx, project, team, { title: "Môj vlastný nadpis", body: "Text tímu", itemIds: [] }, edited!));
    expect(await enrichReleaseDraft(db, project, edited!, "", async () => ({ title: "AI nadpis", body: "AI" }))).toBe(false);
    const g = (await withProject(db, project.id, (tx) => tx.query.changelogEntries.findFirst({ where: eq(schema.changelogEntries.id, edited!) })))!;
    expect(g).toMatchObject({ title: "Môj vlastný nadpis", aiModel: null, publishedAt: null });
  });
});
