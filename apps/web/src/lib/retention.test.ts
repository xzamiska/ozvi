import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, schema, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
process.env.OZVI_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "ozvi-retention-"));

const { applyRetention, CAPTURE_DAYS, decodeReport, encodeReport, isNight, monthsAgo, parseOption, policyOf, previewRetention, retentionTick } = await import("./retention");
const { activityDetail } = await import("./activity");
const { storage } = await import("./storage");

describe("retention helpers", () => {
  it("accepts only the offered options", () => {
    expect(parseOption("180", CAPTURE_DAYS)).toBe(180);
    expect(parseOption("never", CAPTURE_DAYS)).toBeNull();
    expect(parseOption("7", CAPTURE_DAYS)).toBeUndefined();
    expect(parseOption("", CAPTURE_DAYS)).toBeUndefined();
    expect(parseOption(null, CAPTURE_DAYS)).toBeUndefined();
  });
  it("counts months by the calendar", () => {
    expect(monthsAgo(new Date("2026-08-31T03:00:00Z"), 6).toISOString()).toBe("2026-02-28T03:00:00.000Z");
    expect(monthsAgo(new Date("2026-11-08T03:00:00Z"), 24).toISOString()).toBe("2024-11-08T03:00:00.000Z");
  });
  it("runs at night in Central European time", () => {
    expect(isNight(new Date("2026-11-08T02:30:00Z"))).toBe(true); // 03:30 CET
    expect(isNight(new Date("2026-11-08T12:00:00Z"))).toBe(false);
    expect(isNight(new Date("2026-07-08T00:30:00Z"))).toBe(true); // 02:30 CEST
  });
  it("round-trips the activity detail and renders it per language", () => {
    const r = { captures: 3, screenshots: 2, files: 1, bytes: 3 * 1024 * 1024, contacts: 1 };
    expect(decodeReport(encodeReport(r))).toEqual(r);
    expect(decodeReport("capture 30 d")).toBeNull();
    expect(activityDetail("retention.run", encodeReport(r), "en")).toBe("recordings from 3 reports · 2 screenshots · 1 attachment of closed bugs · 3 MB freed · 1 contact anonymised");
    expect(activityDetail("retention.run", encodeReport({ ...r, captures: 0, bytes: 0 }), "sk")).toBe("2 screenshoty · 1 príloha uzavretých chýb · 1 anonymizovaný kontakt");
  });
});

// Integration: local Postgres + disk storage in a temp dir. Skipped without the dev DB.
const db = createDb(process.env.DATABASE_URL!);
const up = await db.execute("select 1").then(() => true, () => false);
const slug = `ret-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const now = new Date("2026-11-08T02:30:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
const capture = { url: "https://app.x.sk/faktury", browser: "Chrome", network: [{ at: 1, method: "GET", url: "/api", status: 500, ms: 3, failed: true }], actions: [{ at: 1, kind: "click", label: "Uložiť" }], errors: [{ at: 1, text: "boom" }], links: { sentry: "https://x.sentry.io/1" }, sentAt: 1 };

const ids: Record<string, string> = {};
const keys: Record<string, string> = {};

describe.skipIf(!up)("retention job", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Ret", plan: "free" }).returning();
      const [p] = await tx.insert(schema.projects).values({
        workspaceId: w!.id, slug, name: "Ret", theme: presets.ozvi, retentionCaptureDays: 180, retentionClosedFilesDays: 90, retentionContactsMonths: 12,
      }).returning();
      ids.workspace = w!.id;
      ids.project = p!.id;
      const projectId = p!.id;
      const user = async (k: string, v: Partial<typeof schema.users.$inferInsert>) => {
        const [u] = await tx.insert(schema.users).values({ projectId, externalId: `${k}-${slug}`, email: `${k}@x.sk`, name: k, ...v }).returning();
        ids[k] = u!.id;
      };
      const old = daysAgo(800);
      await user("reporter", { lastSeenAt: daysAgo(1) });
      await user("imported", { traits: { importedFrom: "fider", company: "Acme" }, createdAt: old });
      await user("insight", { externalId: `insight:i-${slug}@x.sk`, createdAt: old, emailOptOut: true });
      await user("signedIn", { traits: { importedFrom: "fider" }, createdAt: old, lastSeenAt: daysAgo(400) });
      await user("wrote", { traits: { importedFrom: "canny" }, createdAt: old });
      await user("fresh", { traits: { importedFrom: "csv" }, createdAt: daysAgo(30) });
      await user("team", { traits: { importedFrom: "fider" }, createdAt: old, role: "team" });

      let n = 0;
      const item = async (k: string, v: Partial<typeof schema.items.$inferInsert>) => {
        const [i] = await tx.insert(schema.items).values({ projectId, number: ++n, kind: "bug", status: "new", title: k, authorId: ids.reporter, ...v }).returning();
        ids[k] = i!.id;
      };
      await item("oldBug", { context: capture, createdAt: daysAgo(200) });
      await item("newBug", { context: capture, createdAt: daysAgo(10) });
      await item("closedBug", { status: "fixed", createdAt: daysAgo(150), updatedAt: daysAgo(100) });
      await item("reopenedLater", { status: "verified", createdAt: daysAgo(150), updatedAt: daysAgo(100) });
      await item("openBug", { createdAt: daysAgo(300) });
      await item("idea", { kind: "idea", status: "open", voteCount: 2, authorId: null });
      await item("boardPost", { kind: "idea", status: "open", authorId: ids.wrote, source: "board" });
      // Closed 100 days ago by its status event, though touched (e.g. tagged) 5 days ago: only the event counts.
      await tx.update(schema.items).set({ updatedAt: daysAgo(5) }).where(eq(schema.items.id, ids.reopenedLater!));
      await tx.insert(schema.itemEvents).values({ projectId, itemId: ids.reopenedLater!, fromStatus: "fixed", toStatus: "verified", createdAt: daysAgo(20) });
      await tx.insert(schema.votes).values([
        { projectId, itemId: ids.idea!, userId: ids.insight!, weight: 1 },
        { projectId, itemId: ids.idea!, userId: ids.reporter!, weight: 1 },
      ]);
      await tx.insert(schema.emails).values({ projectId, userId: ids.imported!, to: "imported@x.sk", kind: "t", subject: "s", summary: "s", html: "x", text: "x", status: "skipped" });

      const file = async (k: string, itemKey: string, name: string, createdAt: Date) => {
        const key = `${projectId}/${ids[itemKey]}/${k.toLowerCase()}`;
        await storage().put(key, new Uint8Array(1024), "image/jpeg");
        const [a] = await tx.insert(schema.attachments).values({ projectId, itemId: ids[itemKey]!, storageKey: key, name, mime: "image/jpeg", bytes: 1024, createdAt }).returning();
        ids[k] = a!.id;
        keys[k] = key;
      };
      await file("oldShot", "oldBug", "screenshot.jpg", daysAgo(200));
      await file("oldExtra", "oldBug", "log.png", daysAgo(200));
      await file("newShot", "newBug", "screenshot.jpg", daysAgo(10));
      await file("closedFile", "closedBug", "export.png", daysAgo(150));
      await file("reopenedFile", "reopenedLater", "export.png", daysAgo(150));
      await file("openFile", "openBug", "export.png", daysAgo(300));
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.id, ids.workspace!)));
    await db.$client.end();
  });

  const project = async () => (await withSystem(db, (tx) => tx.select().from(schema.projects).where(eq(schema.projects.id, ids.project!))))[0]!;
  const attachmentIds = async () => (await withSystem(db, (tx) => tx.select({ id: schema.attachments.id }).from(schema.attachments)
    .where(eq(schema.attachments.projectId, ids.project!)))).map((a) => a.id).sort();

  const expected = { captures: 1, screenshots: 1, files: 1, bytes: 2048, contacts: 2 };

  it("previews without changing anything (dry run)", async () => {
    const before = await attachmentIds();
    expect(await previewRetention(db, ids.project!, policyOf(await project()), now)).toEqual(expected);
    // Off switches: nothing at all.
    expect(await previewRetention(db, ids.project!, { captureDays: null, closedFilesDays: null, contactsMonths: null }, now))
      .toEqual({ captures: 0, screenshots: 0, files: 0, bytes: 0, contacts: 0 });
    // Shorter capture window reaches the newer report too.
    expect((await previewRetention(db, ids.project!, { captureDays: 30, closedFilesDays: null, contactsMonths: null }, daysAgo(-30))).captures).toBe(2);
    expect(await attachmentIds()).toEqual(before);
    const [bug] = await withSystem(db, (tx) => tx.select().from(schema.items).where(eq(schema.items.id, ids.oldBug!)));
    expect(bug!.context).toMatchObject({ network: capture.network });
    expect(await storage().get(keys.oldShot!)).not.toBeNull();
  });

  it("deletes for real: capture, screenshots, closed bugs' files, placeholder contacts", async () => {
    expect(await applyRetention(db, ids.project!, policyOf(await project()), now)).toEqual(expected);

    const bugs = await withSystem(db, (tx) => tx.select({ id: schema.items.id, context: schema.items.context }).from(schema.items)
      .where(inArray(schema.items.id, [ids.oldBug!, ids.newBug!])));
    const oldCtx = bugs.find((b) => b.id === ids.oldBug)!.context as Record<string, unknown>;
    expect(oldCtx).toEqual({ url: capture.url, browser: "Chrome", captureRemovedAt: now.toISOString() });
    expect(bugs.find((b) => b.id === ids.newBug)!.context).toMatchObject({ network: capture.network });

    // The old screenshot and the closed bug's file are gone (rows and bytes); everything else stays.
    expect(await attachmentIds()).toEqual([ids.oldExtra!, ids.newShot!, ids.reopenedFile!, ids.openFile!].sort());
    expect(await storage().get(keys.oldShot!)).toBeNull();
    expect(await storage().get(keys.closedFile!)).toBeNull();
    expect(await storage().get(keys.openFile!)).not.toBeNull();

    // Placeholders lose personal details but keep their votes; real people are untouched.
    const people = new Map((await withSystem(db, (tx) => tx.select().from(schema.users).where(eq(schema.users.projectId, ids.project!)))).map((u) => [u.id, u]));
    for (const k of ["imported", "insight"]) {
      const u = people.get(ids[k]!)!;
      expect(u).toMatchObject({ email: null, name: null, emailOptOut: true, externalId: `anon:${u.id}` });
      expect(Object.keys(u.traits as object).sort()).toEqual(["anonymizedAt", "importedFrom"]);
    }
    for (const k of ["reporter", "signedIn", "wrote", "fresh", "team"]) expect(people.get(ids[k]!)!.email).toBe(`${k}@x.sk`);
    const [idea] = await withSystem(db, (tx) => tx.select({ v: schema.items.voteCount }).from(schema.items).where(eq(schema.items.id, ids.idea!)));
    expect(idea!.v).toBe(2);
    const votes = await withSystem(db, (tx) => tx.select().from(schema.votes).where(and(eq(schema.votes.itemId, ids.idea!), eq(schema.votes.userId, ids.insight!))));
    expect(votes).toHaveLength(1);
    const mails = await withSystem(db, (tx) => tx.select().from(schema.emails).where(eq(schema.emails.userId, ids.imported!)));
    expect(mails).toHaveLength(0);

    // A second run finds nothing.
    expect(await applyRetention(db, ids.project!, policyOf(await project()), now)).toEqual({ captures: 0, screenshots: 0, files: 0, bytes: 0, contacts: 0 });
  });

  it("nightly tick: only at night, once per night, logs what it removed", async () => {
    const scope = { projectIds: [ids.project!] };
    // Daytime: nothing runs.
    expect((await retentionTick(db, new Date("2026-11-08T12:00:00Z"), scope)).size).toBe(0);
    // Make one more thing due: the newer report, 200 days later.
    const later = new Date(now.getTime() + 200 * 86_400_000);
    const night = new Date(Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate(), 2, 30));
    const r1 = await retentionTick(db, night, scope);
    expect(r1.get(ids.project!)).toMatchObject({ captures: 1, screenshots: 1 });
    expect((await project()).retentionRunAt?.toISOString()).toBe(night.toISOString());
    const log = await withSystem(db, (tx) => tx.select().from(schema.activity).where(eq(schema.activity.projectId, ids.project!)));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: "retention.run", actor: null });
    expect(decodeReport(log[0]!.detail)).toMatchObject({ captures: 1, screenshots: 1 });
    // Same night again: not due.
    expect((await retentionTick(db, new Date(night.getTime() + 3600_000), scope)).size).toBe(0);
    // Next night: due, nothing to remove, nothing logged.
    expect((await retentionTick(db, new Date(night.getTime() + 86_400_000), scope)).get(ids.project!)).toMatchObject({ captures: 0, files: 0 });
    expect(await withSystem(db, (tx) => tx.select().from(schema.activity).where(eq(schema.activity.projectId, ids.project!)))).toHaveLength(1);
  });
});
