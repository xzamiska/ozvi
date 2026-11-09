import { createDb, schema, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { and, eq, inArray, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderMail } from "./render";
import { digests, tick } from "./worker";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

describe("renderMail", () => {
  it("escapes user text and uses the theme", () => {
    const m = renderMail({ subject: "s", summary: "", heading: "<b>x</b>", paragraphs: ['"><script>'], quote: "<img>" },
      { ...presets.slivka, density: "comfortable", voting: { style: "upvote", budget: null } } as never, "Slivka", null);
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img>");
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(m.html).toContain("#8E3B8E");
  });
});

// Integration: local Postgres + an in-memory transport. Skipped without the dev DB.
// The dev DB is shared with other test files (run in parallel) and with a running dev server's own worker.
// So every run here is scoped to this file's project, and queued rows are due only in a "now" one hour
// ahead: the live worker (real now) never claims them, and other files' mail never enters our batch.
const db = createDb(process.env.DATABASE_URL ?? "postgres://ozvi:ozvi@localhost:5446/ozvi");
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const slug = `mail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const good = `u-${slug}@x.sk`;
const bad = `bad-${slug}@x.sk`;
const sent: { to: string; subject: string }[] = [];
const transport = nodemailer.createTransport({ jsonTransport: true });
const orig = transport.sendMail.bind(transport);
transport.sendMail = (async (m: { to: string; subject: string }) => {
  if (m.to === bad) throw new Error("550 mailbox unavailable");
  sent.push({ to: m.to, subject: m.subject });
  return orig(m as never);
}) as never;
let projectId = "";
let userId = "";
let badId = "";
const later = () => new Date(Date.now() + 3600_000);
const scope = () => ({ projectIds: [projectId], now: new Date(Date.now() + 2 * 3600_000) });

describe.skipIf(!up)("email worker", () => {
  beforeAll(async () => {
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug, name: "Mail", plan: "free" }).returning();
      const [p] = await tx.insert(schema.projects).values({ workspaceId: w!.id, slug, name: "Mail", theme: presets.ozvi }).returning();
      projectId = p!.id;
      const [u] = await tx.insert(schema.users).values({ projectId, externalId: "u", email: good }).returning();
      userId = u!.id;
      const [b] = await tx.insert(schema.users).values({ projectId, externalId: "bad", email: bad }).returning();
      badId = b!.id;
    });
  });
  afterAll(async () => {
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.slug, slug)));
    await db.$client.end();
  });

  const mail = (subject: string) => ({ projectId, userId, to: good, kind: "t", subject, summary: subject, html: "<p>x</p>", text: "x", sendAfter: later() });
  const statusOf = (subjects: string[]) => withSystem(db, (tx) => tx.select({ s: schema.emails.status }).from(schema.emails)
    .where(and(eq(schema.emails.projectId, projectId), inArray(schema.emails.subject, subjects))));

  it("sends queued mail", async () => {
    await withSystem(db, (tx) => tx.insert(schema.emails).values(mail("prvý")));
    await tick(db, transport, scope());
    expect(sent.map((s) => s.subject)).toContain("prvý");
    expect((await statusOf(["prvý"]))[0]!.s).toBe("sent");
  });

  it("only touches its scope and rows that are due", async () => {
    // Due an hour from now: a run with the real clock leaves it queued.
    await withSystem(db, (tx) => tx.insert(schema.emails).values(mail("neskôr")));
    sent.length = 0;
    await tick(db, transport, { projectIds: [projectId] });
    expect(sent).toEqual([]);
    // A run scoped to another project doesn't see it either.
    await tick(db, transport, { projectIds: ["00000000-0000-0000-0000-000000000000"], now: scope().now });
    expect((await statusOf(["neskôr"]))[0]!.s).toBe("queued");
    await tick(db, transport, scope());
    expect(sent.map((s) => s.subject)).toEqual(["neskôr"]);
  });

  it("defers over the free quota and sends one digest instead", async () => {
    await withSystem(db, async (tx) => {
      // Fill the month: 1 000 already sent on the free plan.
      await tx.insert(schema.emails).values(Array.from({ length: 1000 }, () => ({ ...mail("old"), status: "sent" as const, sentAt: new Date() })));
      await tx.insert(schema.emails).values([mail("nad limit 1"), mail("nad limit 2")]);
    });
    sent.length = 0;
    const r = await tick(db, transport, scope());
    expect(r.deferred).toBe(2);
    expect(sent).toEqual([]);

    const n = await digests(db, transport, 0, scope());
    expect(n).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toMatch(/^Mail: 2 novinky/);
    expect((await statusOf(["nad limit 1", "nad limit 2"])).every((r) => r.s === "digested")).toBe(true);
  });

  it("isolates a failing recipient: others are not re-sent, the bad one is marked failed", async () => {
    await withSystem(db, (tx) => tx.insert(schema.emails).values([
      { ...mail("pre zlú adresu"), userId: badId, to: bad, status: "deferred" as const },
      { ...mail("pre dobrú adresu"), status: "deferred" as const },
    ]));
    sent.length = 0;
    expect(await digests(db, transport, 0, scope())).toBe(1);
    expect(await digests(db, transport, 0, scope())).toBe(0); // nothing left: no repeated digest
    expect(sent).toHaveLength(1);
    expect((await statusOf(["pre zlú adresu"]))[0]!.s).toBe("failed");
  });
});
