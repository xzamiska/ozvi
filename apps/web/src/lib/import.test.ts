import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOM, csvCell, parseCsv, parseCsvRecords, sniffDelimiter, toCsv } from "./csv";
import { cannyDump, cannyToImport, type CannyDump } from "./import/canny";
import { csvToImport, guessMapping, isCannyCsv } from "./import/csv-map";
import { mapStatus, parseDate, splitTags } from "./import/model";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";

const fixture = (name: string) => readFileSync(new URL(`./import/fixtures/${name}`, import.meta.url), "utf8");
const cannyJson = () => JSON.parse(fixture("canny-api.json")) as CannyDump;

describe("CSV writer", () => {
  it("neutralises formulas (= + - @ tab CR) with a leading apostrophe", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+420 123")).toBe("'+420 123");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    // Real numbers stay numbers; plain text is untouched.
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("a-b")).toBe("a-b");
  });
  it("quotes delimiters, quotes, newlines and edge spaces for the chosen separator", () => {
    expect(csvCell("a;b", ";")).toBe('"a;b"');
    expect(csvCell("a;b", ",")).toBe("a;b");
    expect(csvCell("a,b", ",")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
    expect(csvCell(" pad")).toBe('" pad"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("1");
    expect(csvCell(new Date("2024-01-02T03:04:05Z"))).toBe("2024-01-02T03:04:05.000Z");
  });
  it("writes UTF-8 BOM + CRLF and round-trips through the parser", () => {
    const out = toCsv(["Názov", "Popis"], [["Čučoriedka; ľad", 'riadok 1\r\nriadok "2"'], ["=1+1", ""]], ";");
    expect(out.startsWith(BOM)).toBe(true);
    expect(out.endsWith("\r\n")).toBe(true);
    expect(parseCsv(out, ";")).toEqual([["Názov", "Popis"], ["Čučoriedka; ľad", 'riadok 1\r\nriadok "2"'], ["'=1+1", ""]]);
  });
  it("sniffs the separator outside quotes and parses records", () => {
    expect(sniffDelimiter('"a,b";c;d\n1;2;3')).toBe(";");
    expect(sniffDelimiter("a,b,c")).toBe(",");
    expect(sniffDelimiter("a\tb")).toBe("\t");
    const { headers, rows } = parseCsvRecords("id;id;\n1;2;3\n\n");
    expect(headers).toEqual(["id", "id (2)", "#3"]);
    expect(rows).toEqual([{ id: "1", "id (2)": "2", "#3": "3" }]);
  });
});

describe("import mapping (pure)", () => {
  it("maps status words in our languages, Canny's and trackers'", () => {
    expect(mapStatus("idea", "Under Review").status).toBe("open");
    expect(mapStatus("idea", "complete").status).toBe("shipped");
    expect(mapStatus("idea", "Rozpracované").status).toBe("in_progress");
    expect(mapStatus("bug", "complete").status).toBe("fixed");
    expect(mapStatus("bug", "closed").status).toBe("wont_fix");
    expect(mapStatus("bug", "Nebudeme riešiť").status).toBe("wont_fix");
    expect(mapStatus("idea", "Beta testing")).toEqual({ status: "open", sub: "Beta testing", known: false });
  });
  it("reads dates in ISO, Slovak and US forms; rejects nonsense", () => {
    expect(parseDate("2024-03-01 10:00:00")).toBe("2024-03-01T10:00:00.000Z");
    expect(parseDate("1. 3. 2024 10:00")).toBe("2024-03-01T10:00:00.000Z");
    expect(parseDate("03/01/2024")).toBe("2024-03-01T00:00:00.000Z");
    expect(parseDate("yesterday")).toBeNull();
    expect(parseDate("")).toBeUndefined();
  });
  it("splits and dedupes tags", () => {
    expect(splitTags("UI, ui; Theme | ")).toEqual(["UI", "Theme"]);
  });

  it("maps a Canny API dump: boards → kinds, statuses, priorities, internal notes, identities", () => {
    const d = cannyToImport(cannyJson(), { "b-int": "skip" });
    expect(d.items.map((i) => [i.title, i.kind, i.status])).toEqual([
      ["Dark mode", "idea", "planned"], ["Export to Excel", "idea", "shipped"], ["Zapier", "idea", "open"], ["Login fails on Safari", "bug", "in_progress"],
    ]);
    const dark = d.items[0]!;
    expect(dark.sid).toBe("id:https://acme.canny.io/feature-requests/p/dark-mode");
    expect(dark.tags).toEqual(["UI", "Theme"]);
    expect(dark.body).toContain("https://canny-assets.io/img/1.png");
    expect(d.items[2]!.subStatus).toBe("Beta testing");
    const ana = d.users.find((u) => u.email === "ana@acme.io")!;
    expect(ana).toMatchObject({ sid: "email:ana@acme.io", externalId: "app-41", traits: { company: "Acme", companyId: "c1", mrr: 4900 } });
    expect(d.users.find((u) => u.name === "No Mail")).toMatchObject({ sid: "canny:u3", email: null, externalId: "canny:u3" });
    // Votes: weights from priority, none on bugs; the skipped board's comment is gone; internal stays internal.
    expect(d.votes.map((v) => v.weight)).toEqual([3, 1, 2, 1]);
    expect(d.comments.map((c) => [c.body, c.internal])).toEqual([["Yes please!", false], ["Talk to design first", true], ["On it", false]]);
  });

  it("pages through the Canny API with skip and cursors, key in the body", async () => {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const fx = cannyJson();
    const fake = (async (url: string, init: RequestInit) => {
      const path = url.replace("https://canny.io/api/", "");
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ path, body });
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (body.apiKey !== "secret-key-123") return new Response(JSON.stringify({ error: "invalid api key" }), { status: 401 });
      if (path === "v1/boards/list") return json({ boards: fx.boards });
      const posts = fx.posts.filter((p) => p.board?.id === body.boardID);
      if (path === "v1/posts/list") return json({ posts: posts.slice(Number(body.skip), Number(body.skip) + 1), hasMore: Number(body.skip) + 1 < posts.length });
      const ids = new Set(posts.map((p) => p.id));
      const list = (path === "v2/comments/list" ? fx.comments : fx.votes).filter((x) => ids.has(x.post!.id));
      const at = body.cursor ? Number(body.cursor) : 0;
      return json({ items: list.slice(at, at + 2), hasNextPage: at + 2 < list.length, cursor: String(at + 2) });
    }) as unknown as typeof fetch;
    // limit=1 per page in the fake to exercise paging.
    const dump = await cannyDump("secret-key-123", ["b-feat", "b-bugs"], { fetch: fake });
    expect(dump.posts).toHaveLength(4);
    expect(dump.votes).toHaveLength(5);
    expect(dump.comments).toHaveLength(3);
    expect(calls.every((c) => c.body.apiKey === "secret-key-123")).toBe(true);
    await expect(cannyDump("wrong-key-000", ["b-feat"], { fetch: fake })).rejects.toMatchObject({ code: "key" });
  });

  it("recognises Canny's CSV export and reports row-level problems", () => {
    const text = fixture("canny-posts.csv");
    const { headers } = parseCsvRecords(text);
    expect(isCannyCsv(headers)).toBe(true);
    const mapping = guessMapping(headers);
    expect(mapping).toMatchObject({ title: "Post Title", body: "Post Detail", status: "Post Status", createdAt: "Date created", tags: "Tags", authorName: "Post Author", id: "Post URL", links: "Image URLs" });
    const d = csvToImport(text, { mapping, defaultKind: "idea" });
    expect(d.source).toBe("canny");
    expect(d.items.map((i) => i.title)).toEqual(["Dark mode", "Export to Excel", '=HYPERLINK("http://evil")']);
    expect(d.items[1]!.body).toBe("Line one\nline two, with comma");
    expect(d.items[0]!.authorSid).toBe("email:ana@acme.io");
    expect(d.issues).toEqual([
      { row: 4, key: "titleMissing", level: "error" },
      { row: 5, key: "statusUnknown", value: "weird status", level: "warning" },
      { row: 5, key: "dateInvalid", value: "yesterday", level: "warning" },
    ]);
    expect(d.notes).toEqual([{ key: "cannyCsvNoVoters", n: 4 }]);
  });

  it("generic CSV: kind column, voter e-mails, stable ids without an id column", () => {
    const text = "Názov;Typ;Stav;E-mail;Hlasujúci\nRýchlejší export;nápad;Plánované;eva@x.sk;a@x.sk, b@x.sk a@x.sk\nPadá tlač;chyba;;bad-mail;\n";
    const m = guessMapping(parseCsvRecords(text).headers);
    expect(m).toMatchObject({ title: "Názov", kind: "Typ", status: "Stav", authorEmail: "E-mail", voterEmails: "Hlasujúci" });
    const a = csvToImport(text, { mapping: m, defaultKind: "idea" });
    const b = csvToImport(text, { mapping: m, defaultKind: "idea" });
    expect(a.items.map((i) => [i.kind, i.status])).toEqual([["idea", "planned"], ["bug", "new"]]);
    expect(a.votes).toHaveLength(2);
    expect(a.items.map((i) => i.sid)).toEqual(b.items.map((i) => i.sid));
    expect(a.issues).toEqual([{ row: 3, key: "emailInvalid", value: "bad-mail", level: "warning" }]);
  });
});

/* ---------- against the database ---------- */

const db = createDb(process.env.DATABASE_URL);
const migrated = await db.execute(sql`select 1 from import_runs limit 1`).then(() => true, () => false);
const slug = `import-${Date.now()}`;
let project: typeof schema.projects.$inferSelect;
let existing: typeof schema.users.$inferSelect;

const { previewImport, applyImport, undoImport } = await import("./import/engine");
const { exportItems, exportVoters, listFilter } = await import("./export");

async function newRun(source: string) {
  const [r] = await withProject(db, project.id, (tx) => tx.insert(schema.importRuns).values({ projectId: project.id, source, status: "running" }).returning());
  return r!.id;
}
const counts = () => withProject(db, project.id, async (tx) => {
  const n = async (t: typeof schema.items | typeof schema.users | typeof schema.comments | typeof schema.votes | typeof schema.tags | typeof schema.emails | typeof schema.webhookDeliveries) =>
    (await tx.select({ n: sql<number>`count(*)::int` }).from(t))[0]!.n;
  return { items: await n(schema.items), users: await n(schema.users), comments: await n(schema.comments), votes: await n(schema.votes), tags: await n(schema.tags),
    emails: await n(schema.emails), webhooks: await n(schema.webhookDeliveries) };
});

describe.skipIf(!migrated)("import engine (DB)", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Imp" }).returning();
      project = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Imp", theme: presets.ozvi, voteMode: "importance", itemSeq: 0 }).returning())[0]!;
      // Bob is already on the board (signed in via SSO): the import must reuse him, never delete him.
      existing = (await tx.insert(schema.users).values({ projectId: project.id, externalId: "sso-bob", email: "Bob@Beta.sk", name: "Bob B." }).returning())[0]!;
      await tx.insert(schema.users).values({ projectId: project.id, externalId: "sso-team", email: "team@acme.io", role: "team" });
      await tx.insert(schema.webhooks).values({ projectId: project.id, url: "https://hooks.example/x", secretEnc: "x", includeBugs: true });
      await tx.insert(schema.customStatuses).values({ projectId: project.id, kind: "idea", stage: "in_progress", labels: { sk: "Beta testovanie", en: "Beta testing" } });
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
  });

  it("dry run shows what would be created and writes nothing", async () => {
    const before = await counts();
    const data = cannyToImport(cannyJson(), { "b-int": "skip" });
    const p = await withProject(db, project.id, (tx) => previewImport(tx, data));
    expect(p.items).toEqual({ create: 4, skip: 0, ideas: 3, bugs: 1 });
    // Ana, No Mail, Cyril, PM are new; Bob exists.
    expect(p.users).toEqual({ create: 4, existing: 1 });
    expect(p.votes.create).toBe(4);
    expect(p.comments.create).toBe(3);
    expect(p.tags.create).toEqual(["UI", "Theme"]);
    expect(await counts()).toEqual(before);
  });

  it("imports Canny without e-mails or webhooks, reusing existing people", async () => {
    const before = await counts();
    const run = await newRun("canny");
    const r = await applyImport(db, project, run, cannyToImport(cannyJson(), { "b-int": "skip" }));
    expect(r).toMatchObject({ users: 4, tags: 2, items: 4, ideas: 3, bugs: 1, comments: 3, votes: 4 });
    const after = await counts();
    expect(after.emails).toBe(before.emails);
    expect(after.webhooks).toBe(before.webhooks);
    await withProject(db, project.id, async (tx) => {
      const dark = (await tx.select().from(schema.items).where(eq(schema.items.title, "Dark mode")))[0]!;
      expect(dark.voteCount).toBe(3 + 1 + 2);
      expect(dark.createdAt.toISOString()).toBe("2024-03-01T10:00:00.000Z");
      const zap = (await tx.select().from(schema.items).where(eq(schema.items.title, "Zapier")))[0]!;
      expect(zap.status).toBe("in_progress"); // Canny's "Beta testing" → our custom sub-status
      expect(zap.subStatusId).not.toBeNull();
      const bobVotes = await tx.select().from(schema.votes).where(eq(schema.votes.userId, existing.id));
      expect(bobVotes).toHaveLength(2);
      const ana = (await tx.select().from(schema.users).where(eq(schema.users.externalId, "app-41")))[0]!;
      expect(ana.traits).toMatchObject({ company: "Acme", mrr: 4900, importedFrom: "canny" });
      const notes = await tx.select().from(schema.comments).where(eq(schema.comments.internal, true));
      expect(notes.map((c) => c.body)).toEqual(["Talk to design first"]);
    });
  });

  it("is idempotent: the same data again, and Canny's CSV of the same posts, create nothing new", async () => {
    const before = await counts();
    const again = await applyImport(db, project, await newRun("canny"), cannyToImport(cannyJson(), { "b-int": "skip" }));
    expect(again).toMatchObject({ users: 0, tags: 0, items: 0, comments: 0, votes: 0, skipped: { items: 4, comments: 3, votes: 4 } });
    const text = fixture("canny-posts.csv");
    const csv = csvToImport(text, { mapping: guessMapping(parseCsvRecords(text).headers), defaultKind: "idea" });
    const p = await withProject(db, project.id, (tx) => previewImport(tx, csv));
    // Dark mode and Export to Excel are known by their Canny URL; only the formula row is new.
    expect(p.items).toMatchObject({ create: 1, skip: 2 });
    expect(await counts()).toEqual(before);
  });

  it("exports what was imported, formula-safe, with weighted votes and voter companies", async () => {
    const csvRun = await newRun("canny");
    const text = fixture("canny-posts.csv");
    await applyImport(db, project, csvRun, csvToImport(text, { mapping: guessMapping(parseCsvRecords(text).headers), defaultKind: "idea" }));
    const sheet = await withProject(db, project.id, (tx) => exportItems(tx, listFilter("idea", new URLSearchParams({ f: "all", sort: "top" })), "en", ",", (n) => `https://x/i/${n}`));
    const out = toCsv(sheet.header, sheet.rows, ",");
    expect(out).toContain("'=HYPERLINK(");
    expect(sheet.header).toContain("Vote weight");
    const dark = sheet.rows.find((r) => r[1] === "Dark mode")!;
    expect(dark[6]).toBe(3); // voters
    expect(dark[7]).toBe(6); // weighted
    expect(dark[8]).toBe(2); // comments incl. the internal note
    expect(dark[9]).toBe("Theme, UI");
    const search = await withProject(db, project.id, (tx) => exportItems(tx, listFilter("idea", new URLSearchParams({ f: "all", q: "excel" })), "sk", ";", String));
    expect(search.rows.map((r) => r[1])).toEqual(["Export to Excel"]);
    const voters = await withProject(db, project.id, (tx) => exportVoters(tx, listFilter("idea", new URLSearchParams({ f: "all", tag: "ui" })), "sk", ";"));
    expect(voters.rows.map((r) => [r[1], r[4]])).toEqual([["Dark mode", 3], ["Dark mode", 1], ["Dark mode", 2]]);
    expect(voters.rows[0]![7]).toBe("49,00");
    // Undo just this CSV run: only its one new post goes.
    const u = await withProject(db, project.id, (tx) => undoImport(tx, csvRun));
    expect(u).toMatchObject({ items: 1, votes: 0, comments: 0 });
  });

  it("undo deletes what the run created, keeps people who were there before", async () => {
    const [first] = await withProject(db, project.id, (tx) => tx.select({ runId: schema.importRecords.runId }).from(schema.importRecords)
      .where(eq(schema.importRecords.sourceType, "item")).limit(1));
    const u = await withProject(db, project.id, (tx) => undoImport(tx, first!.runId));
    expect(u).toEqual({ items: 4, comments: 3, votes: 4, users: 4, tags: 2 });
    const after = await counts();
    expect(after).toMatchObject({ items: 0, comments: 0, votes: 0, tags: 0, users: 2 });
    await withProject(db, project.id, async (tx) => {
      expect(await tx.select().from(schema.importRecords)).toHaveLength(0);
      expect((await tx.select().from(schema.importRuns).where(eq(schema.importRuns.id, first!.runId)))[0]!.status).toBe("undone");
    });
    // After undo the same import creates everything again.
    const back = await applyImport(db, project, await newRun("canny"), cannyToImport(cannyJson(), { "b-int": "skip" }));
    expect(back.items).toBe(4);
  });
});
