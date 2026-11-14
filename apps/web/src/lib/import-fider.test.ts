import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fiderPostNumber } from "./import/legacy-links";
import { blobBytes, fiderFromApi, fiderFromBackup, fiderSummary, fiderToImport, tagColor, unzip, type FiderRows } from "./import/fider";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
process.env.OZVI_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "ozvi-fider-"));

const dir = new URL("./import/fixtures/fider-backup/", import.meta.url);
const tables = () => Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(new URL(f, dir))]));

/** A real zip (deflate, like Fider's Go archive/zip) of the fixture tables. */
function zip(files: Record<string, Uint8Array>): Uint8Array {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const body = deflateRawSync(data);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(local, n, body); central.push(c, n);
    offset += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
const backupZip = (extra: Record<string, Uint8Array> = {}) => zip({ ...tables(), ...extra });

/** Fider's REST API over the same fixture data (shapes as Fider serves them). */
function fakeApi(rows: FiderRows, key = "fider-admin-key-1") {
  const calls: string[] = [];
  const role = (r: number | string) => ["", "visitor", "collaborator", "administrator"][Number(r)];
  const status = (s: number | string) => ["open", "started", "completed", "declined", "planned", "duplicate", "deleted"][Number(s)];
  const user = (id: number | null, email = false) => {
    const u = rows.users.find((x) => x.id === id);
    return u ? { id: u.id, name: u.name, role: role(u.role), status: String(u.status) === "2" ? "deleted" : "active", ...(email ? { email: u.email } : {}) } : null;
  };
  const f = async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (new Headers(init?.headers).get("authorization") !== `Bearer ${key}`) return new Response('{"errors":[]}', { status: 401 });
    const u = new URL(url);
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    const live = rows.posts.filter((p) => !["5", "6"].includes(String(p.status)));
    if (u.pathname === "/api/v1/tags") return json(rows.tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug, color: t.color, isPublic: t.is_public })));
    if (u.pathname === "/api/v1/users") {
      return json(rows.users.filter((x) => String(x.status) !== "2").map((x) => ({ id: x.id, name: x.name, email: x.email, role: role(x.role), status: "active",
        providers: rows.user_providers.filter((p) => p.user_id === x.id).map((p) => ({ name: p.provider, uid: p.provider_uid })) })));
    }
    if (u.pathname === "/api/v1/posts") {
      const list = u.searchParams.get("statuses") === "duplicate" ? rows.posts.filter((p) => String(p.status) === "5") : live;
      return json(list.map((p) => ({
        id: p.id, number: p.number, title: p.title, description: p.description, createdAt: p.created_at, status: status(p.status), user: user(p.user_id),
        tags: rows.post_tags.filter((t) => t.post_id === p.id).map((t) => rows.tags.find((g) => g.id === t.tag_id)!.slug),
        response: p.response || p.original_id ? { text: p.response, respondedAt: p.response_date, user: user(p.response_user_id),
          original: p.original_id ? { number: rows.posts.find((o) => o.id === p.original_id)!.number } : null } : null,
      })));
    }
    const m = /^\/api\/v1\/posts\/(\d+)\/(comments|votes)$/.exec(u.pathname);
    if (m) {
      const post = rows.posts.find((p) => p.number === Number(m[1]))!;
      if (m[2] === "votes") return json(rows.post_votes.filter((v) => v.post_id === post.id).map((v) => ({ createdAt: v.created_at, user: user(v.user_id, true) })));
      return json(rows.comments.filter((c) => c.post_id === post.id && !c.deleted_at).map((c) => ({ id: c.id, content: c.content, createdAt: c.created_at, user: user(c.user_id),
        attachments: rows.attachments.filter((a) => a.comment_id === c.id).map((a) => a.attachment_bkey) })));
    }
    if (u.pathname.startsWith("/static/images/")) return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]), { status: 200 });
    return new Response("not found", { status: 404 });
  };
  return { f, calls };
}

const OPTS = { bugTag: "bug", provider: "_billiwo" };

describe("Fider backup and mapping (pure)", () => {
  it("reads Fider's backup.zip: JSON arrays, row-per-line files, null tables, bytea blobs", () => {
    const files = unzip(backupZip());
    expect(files.has("posts.json")).toBe(true);
    const { rows, blobs } = fiderFromBackup(backupZip());
    expect(rows.tenant?.name).toBe("Billiwo");
    expect(rows.posts).toHaveLength(5);
    expect(rows.user_providers).toHaveLength(3); // NDJSON file
    expect([...blobs.get("attachments/abc-screen.png")!]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(blobBytes("\\x6869")).toEqual(new Uint8Array([0x68, 0x69]));
    expect(() => fiderFromBackup(new Uint8Array([1, 2, 3]))).toThrow(expect.objectContaining({ code: "fiderBackup" }));
    expect(() => fiderFromBackup(zip({ "users.json": Buffer.from("[]") }))).toThrow(expect.objectContaining({ code: "fiderBackup" }));
  });

  it("suggests the bug tag and the host app's provider", () => {
    const s = fiderSummary(fiderFromBackup(backupZip()).rows);
    expect(s.suggested).toEqual({ bugTag: "bug", provider: "_billiwo" });
    expect(s.posts).toBe(4); // the deleted one is not counted
    expect(s.tags.find((t) => t.slug === "vip-zakaznik")).toMatchObject({ public: false, posts: 1 });
  });

  it("maps statuses, bugs, duplicates, responses, tags, identities and roles", () => {
    const d = fiderToImport(fiderFromBackup(backupZip()).rows, OPTS);
    expect(d.items.map((i) => [i.number, i.kind, i.status, i.mergedIntoSid ?? null])).toEqual([
      [1, "idea", "planned", null], [2, "idea", "open", "post:1"], [3, "bug", "fixed", null], [7, "idea", "open", null],
    ]);
    expect(d.items[0]!.tags).toEqual(["Export", "VIP zákazník"]);
    expect(d.items[2]!.tags).toEqual([]); // the bug tag becomes the kind, not a tag
    expect(d.items[3]!.authorSid).toBeNull(); // deleted Fider user
    expect(d.tagMeta).toEqual([{ name: "Export", public: true, color: "green" }, { name: "VIP zákazník", public: false, color: "muted" }]);
    const by = (sid: string) => d.users.find((u) => u.sid === sid);
    expect(by("user:1")).toMatchObject({ externalId: "bw-user-1", role: "admin" });
    expect(by("user:2")).toMatchObject({ externalId: "bw-user-2", email: "maria@firma.test" });
    expect(by("user:3")).toMatchObject({ externalId: "email:jan@firma.test", emailOptOut: true });
    expect(by("user:5")).toMatchObject({ role: "team" });
    expect(by("user:4")).toBeUndefined();
    expect(d.comments.map((c) => c.sid)).toEqual(["comment:1", "comment:3", "response:3", "response:1"]); // by date
    // No votes on bugs (post 3); duplicate keeps its own vote.
    expect(d.votes.map((v) => v.sid).sort()).toEqual(["vote:1:1", "vote:1:2", "vote:1:3", "vote:2:3", "vote:5:5"]);
    expect(d.files!.map((f) => [f.sid, f.itemSid])).toEqual([
      ["file:attachments/abc-screen.png", "post:3"], ["file:attachments/def-log.txt", "post:3"], ["file:attachments/gone.png", "post:1"],
    ]);
    // Without a provider people are matched by e-mail; without a bug tag everything is an idea.
    const plain = fiderToImport(fiderFromBackup(backupZip()).rows, { bugTag: null, provider: null });
    expect(plain.users.find((u) => u.sid === "user:1")!.externalId).toBe("email:peter@billiwo.test");
    expect(plain.items.every((i) => i.kind === "idea")).toBe(true);
    expect(plain.tagMeta!.map((t) => t.name)).toContain("Bug");
  });

  it("colours: hex → nearest theme token", () => {
    expect(tagColor("FF0000")).toBe("red");
    expect(tagColor("#f5a623")).toBe("amber");
    expect(tagColor("1976D2")).toBe("accent");
    expect(tagColor("cccccc")).toBe("muted");
    expect(tagColor("nonsense")).toBe("neutral");
  });

  it("reads the same data through Fider's API with the key as a bearer token, same ids as the backup", async () => {
    const { rows } = fiderFromBackup(backupZip());
    const { f, calls } = fakeApi(rows);
    const api = await fiderFromApi("https://feedback.billiwo.test/", "fider-admin-key-1", { fetch: f });
    const a = fiderToImport(api, OPTS), b = fiderToImport(rows, OPTS);
    const ids = (d: typeof a) => ({ items: d.items.map((i) => [i.sid, i.kind, i.status, i.number, i.mergedIntoSid ?? null]).sort(), votes: d.votes.map((v) => v.sid).sort(),
      comments: d.comments.map((c) => c.sid).sort(), users: d.users.map((u) => [u.sid, u.externalId, u.role ?? null]).sort() });
    expect(ids(a)).toEqual(ids(b));
    expect(calls.every((c) => c.startsWith("https://feedback.billiwo.test/api/v1/"))).toBe(true);
    await expect(fiderFromApi("https://feedback.billiwo.test", "wrong-key-00", { fetch: f })).rejects.toMatchObject({ code: "fiderKey" });
    await expect(fiderFromApi("ftp://x", "fider-admin-key-1", { fetch: f })).rejects.toMatchObject({ code: "fiderUrl" });
    const redirect = async () => new Response(null, { status: 302, headers: { location: "https://elsewhere" } });
    await expect(fiderFromApi("https://feedback.billiwo.test", "fider-admin-key-1", { fetch: redirect })).rejects.toMatchObject({ code: "fiderUrl" });
  });

  it("the API URL goes through the SSRF guard in cloud mode", async () => {
    const { safeFetch } = await import("./net");
    await expect(safeFetch("http://127.0.0.1:5432/api/v1/tags", {}, "cloud")).rejects.toThrow();
    await expect(safeFetch("https://localhost/api/v1/tags", {}, "cloud")).rejects.toThrow();
  });
});

/* ---------- against the database ---------- */

const db = createDb(process.env.DATABASE_URL);
const migrated = await db.execute(sql`select 1 from import_runs limit 1`).then(() => true, () => false);
const slug = `fider-${Date.now()}`;
let project: typeof schema.projects.$inferSelect;
const { previewImport, applyImport, undoImport } = await import("./import/engine");
const { storage } = await import("./storage");

const newRun = async () => (await withProject(db, project.id, (tx) => tx.insert(schema.importRuns).values({ projectId: project.id, source: "fider", status: "running" }).returning()))[0]!.id;
const counts = () => withProject(db, project.id, async (tx) => {
  const n = async (t: typeof schema.items | typeof schema.users | typeof schema.comments | typeof schema.votes | typeof schema.tags | typeof schema.emails | typeof schema.webhookDeliveries | typeof schema.attachments) =>
    (await tx.select({ n: sql<number>`count(*)::int` }).from(t))[0]!.n;
  return { items: await n(schema.items), users: await n(schema.users), comments: await n(schema.comments), votes: await n(schema.votes), tags: await n(schema.tags),
    files: await n(schema.attachments), emails: await n(schema.emails), webhooks: await n(schema.webhookDeliveries) };
});

describe.skipIf(!migrated)("Fider import through the engine (DB)", () => {
  const backup = fiderFromBackup(backupZip());
  const load = async (ref: string) => backup.blobs.get(ref) ?? null;
  let firstRun = "";

  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Fider" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Fider", theme: presets.ozvi, itemSeq: 2 }).returning())[0]!;
      // #2 is taken on the board already; Mária signed in via SSO before the switch; the board admin exists.
      await tx.insert(schema.items).values({ projectId: project.id, kind: "idea", number: 2, title: "Native post", status: "open" });
      await tx.insert(schema.users).values({ projectId: project.id, externalId: "bw-user-2", email: "maria@firma.test", name: "Mária" });
      await tx.insert(schema.users).values({ projectId: project.id, externalId: "owner", email: "owner@billiwo.test", role: "admin" });
      await tx.insert(schema.webhooks).values({ projectId: project.id, url: "https://hooks.example/x", secretEnc: "x", includeBugs: true });
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("dry run: numbers, people, files; nothing written", async () => {
    const before = await counts();
    const p = await withProject(db, project.id, (tx) => previewImport(tx, fiderToImport(backup.rows, OPTS)));
    expect(p.items).toEqual({ create: 4, skip: 0, ideas: 3, bugs: 1 });
    expect(p.numbers).toEqual({ kept: 3, changed: 1 });
    expect(p.users).toEqual({ create: 3, existing: 1 }); // Peter, Ján, Kolega new; Mária by her app id
    expect(p.files.create).toBe(3);
    expect(p.tags.create).toEqual(["Export", "VIP zákazník"]);
    expect(await counts()).toEqual(before);
  });

  it("imports without e-mails or webhooks; keeps numbers, merges duplicates, tag visibility, files", async () => {
    const before = await counts();
    firstRun = await newRun();
    const r = await applyImport(db, project, firstRun, fiderToImport(backup.rows, OPTS), undefined, load);
    expect(r).toMatchObject({ items: 4, ideas: 3, bugs: 1, merged: 1, votes: 5, comments: 4, users: 3, tags: 2, files: 2, skipped: { files: 1 } });
    const after = await counts();
    expect([after.emails, after.webhooks]).toEqual([before.emails, before.webhooks]);
    await withProject(db, project.id, async (tx) => {
      const all = await tx.select().from(schema.items).orderBy(schema.items.number);
      const byTitle = (t: string) => all.find((i) => i.title === t)!;
      expect(byTitle("Export do Pohody")).toMatchObject({ number: 1, status: "planned", voteCount: 3, source: "import" });
      expect(byTitle("PDF bez diakritiky")).toMatchObject({ number: 3, kind: "bug", status: "fixed" });
      expect(byTitle("Tmavý režim").number).toBe(7);
      const dup = byTitle("Pohoda export prosím");
      expect(dup.number).toBe(8); // #2 was taken → next free after the kept #7
      expect(dup.mergedIntoId).toBe(byTitle("Export do Pohody").id);
      const tagRows = await tx.select().from(schema.tags).orderBy(schema.tags.name);
      expect(tagRows.map((t) => [t.name, t.public, t.color])).toEqual([["Export", true, "green"], ["VIP zákazník", false, "muted"]]);
      const maria = (await tx.select().from(schema.users).where(eq(schema.users.externalId, "bw-user-2")))[0]!;
      expect((await tx.select().from(schema.votes).where(eq(schema.votes.userId, maria.id)))).toHaveLength(1); // bug votes dropped
      const peter = (await tx.select().from(schema.users).where(eq(schema.users.externalId, "bw-user-1")))[0]!;
      expect(peter.role).toBe("admin");
      const jan = (await tx.select().from(schema.users).where(eq(schema.users.externalId, "email:jan@firma.test")))[0]!;
      expect(jan.emailOptOut).toBe(true);
      const files = await tx.select().from(schema.attachments);
      expect(files.map((f) => [f.name, f.mime]).sort()).toEqual([["abc-screen.png", "image/png"], ["def-log.txt", "text/plain"]]);
      expect(await storage().get(files[0]!.storageKey)).not.toBeNull();
      const [proj] = await tx.select({ seq: schema.projects.itemSeq }).from(schema.projects).where(eq(schema.projects.id, project.id));
      expect(proj!.seq).toBe(8);
    });
  });

  it("old Fider links find the item: kept numbers, a renumbered post, a merged duplicate, an unknown post", async () => {
    expect(await fiderPostNumber(db, project.id, 1)).toBe(1);
    expect(await fiderPostNumber(db, project.id, 7)).toBe(7);
    expect(await fiderPostNumber(db, project.id, 3)).toBe(3);
    // Fider #2 became #8 here (taken by a native post) and is a duplicate of #1: the link leads to the original.
    expect(await fiderPostNumber(db, project.id, 2)).toBe(1);
    expect(await fiderPostNumber(db, project.id, 99)).toBeNull();
    expect(await fiderPostNumber(db, project.id, 0)).toBeNull();
  });

  it("re-run after a new post in Fider imports only the new post, its vote and comment", async () => {
    const rows: FiderRows = structuredClone(backup.rows);
    rows.posts.push({ id: 9, number: 9, title: "Nový nápad", description: "", user_id: 3, status: 0, created_at: "2024-06-01T10:00:00Z", response: null,
      response_user_id: null, response_date: null, original_id: null });
    rows.post_votes.push({ user_id: 2, post_id: 9, created_at: "2024-06-02T10:00:00Z" });
    rows.comments.push({ id: 10, content: "Súhlas", post_id: 9, user_id: 2, created_at: "2024-06-03T10:00:00Z" });
    const data = fiderToImport(rows, OPTS);
    const p = await withProject(db, project.id, (tx) => previewImport(tx, data));
    expect(p.items).toMatchObject({ create: 1, skip: 4 });
    expect(p.votes.create).toBe(1);
    expect(p.comments.create).toBe(1);
    expect(p.users.create).toBe(0);
    const r = await applyImport(db, project, await newRun(), data, undefined, load);
    expect(r).toMatchObject({ items: 1, votes: 1, comments: 1, users: 0, tags: 0, merged: 0, files: 0, skipped: { items: 4, votes: 5, comments: 4 } });
    const n = await withProject(db, project.id, async (tx) => (await tx.select().from(schema.items).where(eq(schema.items.title, "Nový nápad")))[0]!);
    expect(n.number).toBe(9);
  });

  it("undo removes the run's posts, files (bytes too), tags and the people it created (also team roles it gave)", async () => {
    const files: string[] = [];
    const keys = await withProject(db, project.id, (tx) => tx.select({ k: schema.attachments.storageKey }).from(schema.attachments));
    const u = await withProject(db, project.id, (tx) => undoImport(tx, firstRun, files));
    expect(u).toMatchObject({ items: 4, votes: 5, tags: 2 });
    expect(files.sort()).toEqual(keys.map((k) => k.k).sort());
    for (const k of files) await storage().remove(k);
    for (const k of files) expect(await storage().get(k)).toBeNull();
    await withProject(db, project.id, async (tx) => {
      const left = await tx.select({ e: schema.users.externalId, role: schema.users.role }).from(schema.users).orderBy(schema.users.externalId);
      // Peter (admin by import) and Kolega (team by import) are gone; Ján stays (author of the second run's post).
      expect(left.map((x) => x.e)).toEqual(["bw-user-2", "email:jan@firma.test", "owner"]);
      expect((await tx.select().from(schema.items)).map((i) => i.title).sort()).toEqual(["Native post", "Nový nápad"]);
    });
  });
});
