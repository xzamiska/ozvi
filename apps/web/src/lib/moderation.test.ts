import { createDb, encryptSecret, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canDeleteComment, canEditComment, canEditPost, canSeePost, COMMENT_EDIT_WINDOW_MS, countLinks, looksLikeSpam, pendingReason, sameTitle,
} from "./moderation-rules";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const member = { id: "m", role: "member" };
const other = { id: "o", role: "member" };
const team = { id: "t", role: "team" };
const admin = { id: "a", role: "admin" };
const blocked = { id: "m", role: "member", blockedAt: new Date() };

describe("post edit rules", () => {
  const idea = { kind: "idea" as const, authorId: "m", status: "open", mergedIntoId: null, deletedAt: null };
  it("author until the team responds; others never; team always", () => {
    expect(canEditPost(idea, member, false)).toBe(true);
    expect(canEditPost(idea, other, false)).toBe(false);
    expect(canEditPost(idea, null, false)).toBe(false);
    expect(canEditPost(idea, team, true)).toBe(true);
    expect(canEditPost({ ...idea, status: "planned" }, admin, true)).toBe(true);
    // The team replied, moved it along, or merged it: the author's text is now part of a conversation.
    expect(canEditPost(idea, member, true)).toBe(false);
    expect(canEditPost({ ...idea, status: "planned" }, member, false)).toBe(false);
    expect(canEditPost({ ...idea, mergedIntoId: "x" }, member, false)).toBe(false);
    expect(canEditPost({ ...idea, kind: "bug", status: "new" }, member, false)).toBe(true);
    expect(canEditPost({ ...idea, kind: "bug", status: "confirmed" }, member, false)).toBe(false);
  });
  it("blocked people and deleted posts", () => {
    expect(canEditPost(idea, blocked, false)).toBe(false);
    expect(canEditPost({ ...idea, deletedAt: new Date() }, team, false)).toBe(false);
  });
});

describe("comment edit window", () => {
  const now = Date.now();
  const c = { authorId: "m", createdAt: new Date(now - 5 * 60_000), deletedAt: null };
  it("author edits for 30 minutes, deletes any time; others never; team always", () => {
    expect(canEditComment(c, member, now)).toBe(true);
    expect(canEditComment(c, member, c.createdAt.getTime() + COMMENT_EDIT_WINDOW_MS + 1)).toBe(false);
    expect(canDeleteComment({ ...c, createdAt: new Date(0) }, member)).toBe(true);
    expect(canEditComment(c, other, now)).toBe(false);
    expect(canDeleteComment(c, other)).toBe(false);
    expect(canEditComment({ ...c, createdAt: new Date(0) }, team, now)).toBe(true);
    expect(canDeleteComment(c, admin)).toBe(true);
    expect(canEditComment(c, blocked, now)).toBe(false);
    expect(canDeleteComment({ ...c, deletedAt: new Date() }, team)).toBe(false);
  });
});

describe("visibility and spam heuristics", () => {
  it("queued ideas: author and team only; deleted: nobody", () => {
    const p = { kind: "idea" as const, authorId: "m", deletedAt: null, pending: true };
    expect(canSeePost(p, member)).toBe(true);
    expect(canSeePost(p, team)).toBe(true);
    expect(canSeePost(p, other)).toBe(false);
    expect(canSeePost(p, null)).toBe(false);
    expect(canSeePost({ ...p, pending: false }, null)).toBe(true);
    expect(canSeePost({ ...p, pending: false, deletedAt: new Date() }, team)).toBe(false);
  });
  it("links send posts to the queue; the setting sends all members' ideas; bugs and team never", () => {
    expect(countLinks("see https://a.sk and www.b.com, not c.d")).toBe(2);
    expect(looksLikeSpam("Buy now https://x.io", "")).toBe(true);
    expect(looksLikeSpam("Export", "https://a.sk https://b.sk")).toBe(false);
    expect(looksLikeSpam("Export", "https://a.sk https://b.sk http://c.sk")).toBe(true);
    const off = { moderateIdeas: false };
    const on = { moderateIdeas: true };
    expect(pendingReason({ kind: "idea", title: "Export", body: "" }, member, off)).toBeNull();
    expect(pendingReason({ kind: "idea", title: "Export", body: "" }, member, on)).toBe("approval");
    expect(pendingReason({ kind: "idea", title: "https://spam.io", body: "" }, member, off)).toBe("links");
    expect(pendingReason({ kind: "idea", title: "Export", body: "" }, team, on)).toBeNull();
    expect(pendingReason({ kind: "bug", title: "https://x", body: "" }, member, on)).toBeNull();
    expect(sameTitle(" Export  do Pohody", "export do pohody")).toBe(true);
  });
});

// Integration against the dev database (skipped without it or before migration 0018).
const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select pending from items limit 0`).then(() => true, () => false);
const slug = `mod-${Date.now()}`;
type User = typeof schema.users.$inferSelect;
let project: typeof schema.projects.$inferSelect;
let tm: User, mb: User, ot: User;

const { createItemFor } = await import("./items");
const { addCommentTo, DomainError } = await import("./domain");
const mod = await import("./moderation");
const { mcpBackend } = await import("./mcp-backend");
const { listItems } = await import("./queries");
const { allow, LIMITS } = await import("./ratelimit");
const { applyVote } = await import("./votes");

describe.skipIf(!up)("moderation integration", () => {
  const byNumber = (n: number) => withProject(db, project.id, async (tx) => (await tx.query.items.findFirst({ where: eq(schema.items.number, n) }))!);

  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Mod" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Mod test", theme: presets.ozvi }).returning())[0]!;
      [tm, mb, ot] = (await tx.insert(schema.users).values([
        { projectId: project.id, externalId: "t", name: "Tím", email: "t@x.sk", role: "team" },
        { projectId: project.id, externalId: "m", name: "Člen", email: "m@x.sk" },
        { projectId: project.id, externalId: "o", name: "Iný", email: "o@x.sk" },
      ]).returning()) as [User, User, User];
      await tx.insert(schema.webhooks).values({ projectId: project.id, url: "https://hooks.example.com/x", secretEnc: encryptSecret("hooksecret") });
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  const deliveries = (event: string) => withProject(db, project.id, (tx) =>
    tx.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.event, event)));

  it("author edits own post, another member cannot, team can; edits are marked", async () => {
    const n = await createItemFor(project, mb, { kind: "idea", title: "Tmavý režim", body: "", context: null, files: [] });
    const item = await byNumber(n);
    await withProject(db, project.id, (tx) => mod.editItem(tx, mb, item, { title: "Tmavý režim v appke", body: "Prosím" }));
    await expect(withProject(db, project.id, (tx) => mod.editItem(tx, ot, item, { title: "Hacked", body: "" }))).rejects.toBeInstanceOf(DomainError);
    // Once the team answers publicly, the author's window closes; the team can still edit.
    await withProject(db, project.id, (tx) => addCommentTo(tx, project, tm, item, "Ďakujeme, pozrieme sa.", false));
    await expect(withProject(db, project.id, (tx) => mod.editItem(tx, mb, item, { title: "Iné", body: "" }))).rejects.toBeInstanceOf(DomainError);
    await withProject(db, project.id, (tx) => mod.editItem(tx, tm, item, { title: "Tmavý režim", body: "Prosím" }));
    const after = await byNumber(n);
    expect(after.title).toBe("Tmavý režim");
    expect(after.editedAt).toBeInstanceOf(Date);
  });

  it("comment edit window, soft delete keeps a placeholder, others cannot touch it", async () => {
    const item = await byNumber(1);
    const c = await withProject(db, project.id, (tx) => addCommentTo(tx, project, mb, item, "Prvá verzia", false));
    await withProject(db, project.id, (tx) => mod.editComment(tx, mb, c, "Opravená verzia"));
    await expect(withProject(db, project.id, (tx) => mod.editComment(tx, mb, c, "Neskoro", Date.now() + 31 * 60_000))).rejects.toThrow(/30 minút/);
    await expect(withProject(db, project.id, (tx) => mod.deleteComment(tx, ot, c))).rejects.toBeInstanceOf(DomainError);
    await withProject(db, project.id, (tx) => mod.deleteComment(tx, mb, c));
    const row = await withProject(db, project.id, (tx) => tx.query.comments.findFirst({ where: eq(schema.comments.id, c.id) }));
    expect(row).toMatchObject({ body: "Opravená verzia", deletedById: mb.id });
    expect(row?.editedAt).toBeInstanceOf(Date);
    // Deleted comments are not counted and not given to MCP.
    const [r] = await withProject(db, project.id, (tx) => listItems(tx, [eq(schema.items.number, 1)], "new", false));
    expect(r?.comments).toBe(1);
    const b = await mcpBackend({ project, user: tm, scope: "triage", tokenId: "m1" });
    expect((await b.get(1))?.comments.map((x) => x.body)).toEqual(["Ďakujeme, pozrieme sa."]);
  });

  it("double submit returns the same post", async () => {
    const a = await createItemFor(project, ot, { kind: "idea", title: "Export do Pohody", body: "", context: null, files: [] });
    const b = await createItemFor(project, ot, { kind: "idea", title: "export  do pohody", body: "", context: null, files: [] });
    expect(b).toBe(a);
  });

  it("queued ideas: visible to author and team only, no webhook until approved; reject shows the reason", async () => {
    await withSystem(db, (tx) => tx.update(schema.projects).set({ moderateIdeas: true }).where(eq(schema.projects.id, project.id)));
    project = { ...project, moderateIdeas: true };
    const before = (await deliveries("item.created")).length;
    const n = await createItemFor(project, mb, { kind: "idea", title: "Fakturácia v EUR aj CZK", body: "", context: null, files: [] });
    expect(await byNumber(n)).toMatchObject({ pending: true, pendingReason: "approval" });
    expect((await deliveries("item.created")).length).toBe(before);
    const ids = async (viewerId?: string) => (await withProject(db, project.id, (tx) => listItems(tx, [eq(schema.items.kind, "idea")], "new", false, { viewerId }))).map((r) => r.number);
    expect(await ids(mb.id)).toContain(n);
    expect(await ids(ot.id)).not.toContain(n);
    expect(await ids()).not.toContain(n);
    const asOther = await mcpBackend({ project, user: ot, scope: "write", tokenId: "m2" });
    expect(await asOther.get(n)).toBeNull();
    expect((await asOther.search({ sort: "new", limit: 50 })).map((i) => i.number)).not.toContain(n);
    const asTeam = await mcpBackend({ project, user: tm, scope: "triage", tokenId: "m3" });
    expect(await asTeam.get(n)).toBeNull();

    await expect(withProject(db, project.id, async (tx) => mod.approveItem(tx, project, mb, await byNumber(n)))).rejects.toBeInstanceOf(DomainError);
    await withProject(db, project.id, async (tx) => mod.approveItem(tx, project, tm, await byNumber(n)));
    expect(await ids(ot.id)).toContain(n);
    expect((await deliveries("item.created")).length).toBe(before + 1);

    // Team posts are never queued; links send a post to the queue even with moderation off.
    await withSystem(db, (tx) => tx.update(schema.projects).set({ moderateIdeas: false }).where(eq(schema.projects.id, project.id)));
    project = { ...project, moderateIdeas: false };
    const spam = await createItemFor(project, ot, { kind: "idea", title: "Lacné hodinky https://spam.example", body: "", context: null, files: [] });
    expect(await byNumber(spam)).toMatchObject({ pending: true, pendingReason: "links" });
    await withProject(db, project.id, async (tx) => mod.rejectItem(tx, project, tm, await byNumber(spam), "Reklama"));
    expect(await byNumber(spam)).toMatchObject({ deleteReason: "Reklama", deletedById: tm.id });
    expect(await ids(ot.id)).not.toContain(spam);
  });

  const mails = (kind: string) => withProject(db, project.id, (tx) => tx.select().from(schema.emails).where(eq(schema.emails.kind, kind)));

  it("rejecting a queued idea e-mails its author the reason in their language, unless they opted out", async () => {
    // A fresh author (the others have used up their posting burst in earlier tests), English-speaking.
    const [rj] = await withSystem(db, (tx) => tx.insert(schema.users).values({ projectId: project.id, externalId: "rj", name: "Rej", email: "rj@x.sk", locale: "en" }).returning());
    const a = await createItemFor(project, rj!, { kind: "idea", title: "Promo https://spam.example", body: "", context: null, files: [] });
    await withProject(db, project.id, async (tx) => mod.rejectItem(tx, project, tm, await byNumber(a), "Looks like an **ad**."));
    const sent = (await mails("idea_rejected")).filter((m) => m.userId === rj!.id && m.subject.includes("Promo"));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toBe("Idea not published: Promo https://spam.example");
    expect(sent[0]!.html).toContain("<strong>ad</strong>");
    expect(sent[0]!.text).toContain("> Looks like an ad.");
    // Opted out: nothing is queued.
    await withSystem(db, (tx) => tx.update(schema.users).set({ emailOptOut: true }).where(eq(schema.users.id, rj!.id)));
    const b = await createItemFor(project, rj!, { kind: "idea", title: "More https://spam.example", body: "", context: null, files: [] });
    await withProject(db, project.id, async (tx) => mod.rejectItem(tx, project, tm, await byNumber(b), "No"));
    expect((await mails("idea_rejected")).filter((m) => m.userId === rj!.id && m.subject.includes("More"))).toHaveLength(0);
  });

  it("comments with suspicious links wait for the team: hidden from others, MCP, webhooks and followers until approved", async () => {
    const n = await createItemFor(project, mb, { kind: "idea", title: "Import z Pohody", body: "", context: null, files: [] });
    const item = await byNumber(n);
    const hooks = (await deliveries("comment.created")).length;
    const spam = "Pozri https://a.example https://b.example https://c.example";
    const c = await withProject(db, project.id, (tx) => addCommentTo(tx, project, ot, item, spam, false));
    expect(c.pending).toBe(true);
    // Team members and a normal comment are never held.
    expect((await withProject(db, project.id, (tx) => addCommentTo(tx, project, tm, item, spam + " tím", false))).pending).toBe(false);
    expect((await withProject(db, project.id, (tx) => addCommentTo(tx, project, ot, item, "Bez odkazov", false))).pending).toBe(false);
    expect((await deliveries("comment.created")).length).toBe(hooks + 2);
    // Only the team was told about the held one; the post's author was not.
    const queued = await mails("comment_queued");
    expect(queued.map((m) => m.userId)).toEqual([tm.id]);
    expect(queued[0]!.html).toContain("https://a.example");
    // Not counted publicly, not in MCP for members, but in the team's queue.
    const [pub] = await withProject(db, project.id, (tx) => listItems(tx, [eq(schema.items.number, n)], "new", false));
    expect(pub?.comments).toBe(2);
    const asMember = await mcpBackend({ project, user: mb, scope: "write", tokenId: "c1" });
    expect((await asMember.get(n))?.comments.map((x) => x.body)).not.toContain(spam);
    const queue = await withProject(db, project.id, (tx) => listItems(tx, [eq(schema.items.kind, "idea")], "new", true, { team: true, queue: true }));
    expect(queue.find((r) => r.number === n)?.pendingComments).toBe(1);
    // Others cannot approve; the team can, and then followers and webhooks hear about it.
    await expect(withProject(db, project.id, (tx) => mod.approveComment(tx, project, mb, item, c))).rejects.toBeInstanceOf(DomainError);
    const before = (await mails("comment")).filter((m) => m.userId === mb.id).length;
    await withProject(db, project.id, (tx) => mod.approveComment(tx, project, tm, item, c));
    expect((await mails("comment")).filter((m) => m.userId === mb.id).length).toBe(before + 1);
    expect((await deliveries("comment.created")).length).toBe(hooks + 3);
    expect((await asMember.get(n))?.comments.map((x) => x.body)).toContain(spam);
    // Adding links later by editing sends it back to the queue.
    const d = await withProject(db, project.id, (tx) => addCommentTo(tx, project, ot, item, "Krátka poznámka", false));
    const edited = await withProject(db, project.id, (tx) => mod.editComment(tx, ot, d, spam + " znova"));
    expect(edited.pending).toBe(true);
  });

  it("deleted posts disappear everywhere and take no comments, votes or merges", async () => {
    const n = await createItemFor(project, ot, { kind: "idea", title: "Zmazať ma", body: "", context: null, files: [] });
    await withProject(db, project.id, async (tx) => mod.deleteItem(tx, ot, await byNumber(n)));
    const item = await byNumber(n);
    expect(item.deletedAt).toBeInstanceOf(Date);
    const b = await mcpBackend({ project, user: tm, scope: "triage", tokenId: "m4" });
    expect(await b.get(n)).toBeNull();
    await expect(b.merge(1, n)).rejects.toThrow();
    await expect(withProject(db, project.id, (tx) => addCommentTo(tx, project, tm, item, "x", false))).rejects.toBeInstanceOf(DomainError);
    expect((await withProject(db, project.id, (tx) => applyVote(tx, project, mb.id, item.id, 1))).ok).toBe(false);
    // The team can bring it back.
    await withProject(db, project.id, async (tx) => mod.restoreItem(tx, tm, await byNumber(n)));
    expect((await byNumber(n)).deletedAt).toBeNull();
  });

  it("blocked people read but cannot post, comment or edit; team cannot be blocked", async () => {
    await expect(withProject(db, project.id, (tx) => mod.setBlocked(tx, mb, ot, true))).rejects.toBeInstanceOf(DomainError);
    await expect(withProject(db, project.id, (tx) => mod.setBlocked(tx, tm, tm, true))).rejects.toBeInstanceOf(DomainError);
    const b = await withProject(db, project.id, (tx) => mod.setBlocked(tx, tm, ot, true));
    expect(b.blockedAt).toBeInstanceOf(Date);
    await expect(createItemFor(project, b, { kind: "bug", title: "Nefunguje", body: "", context: null, files: [] })).rejects.toBeInstanceOf(DomainError);
    await expect(withProject(db, project.id, async (tx) => addCommentTo(tx, project, b, await byNumber(1), "ahoj", false))).rejects.toBeInstanceOf(DomainError);
    const mcp = await mcpBackend({ project, user: b, scope: "write", tokenId: "m5" });
    await expect(mcp.create({ kind: "idea", title: "Cez MCP", body: "" })).rejects.toThrow();
    expect((await mcp.search({ sort: "new", limit: 50 })).length).toBeGreaterThan(0);
    const unblocked = await withProject(db, project.id, (tx) => mod.setBlocked(tx, tm, b, false));
    expect(unblocked.blockedAt).toBeNull();
  });

  it("burst limits for posting and commenting", () => {
    const t = 5_000_000;
    for (let i = 0; i < LIMITS.itemBurst.max; i++) expect(allow("itemBurst", "burst", t)).toBe(true);
    expect(allow("itemBurst", "burst", t)).toBe(false);
    expect(allow("itemBurst", "burst", t + LIMITS.itemBurst.windowMs + 1)).toBe(true);
    for (let i = 0; i < LIMITS.commentBurst.max; i++) expect(allow("commentBurst", "burst", t)).toBe(true);
    expect(allow("commentBurst", "burst", t)).toBe(false);
  });
});
