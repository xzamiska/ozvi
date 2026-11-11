import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.OZVI_SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.OZVI_SECRET_KEY ??= "test-secret-key-0123456789abcdef-xyz";
process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
delete process.env.SMTP_URL;

const ws = await import("./workspace");
const { issueEmailChange, consumeEmailChange, peekEmailChange } = await import("./email-login");

const db = createDb(process.env.DATABASE_URL!);
const tag = `t${Date.now().toString(36)}`;
const mail = (n: string) => `${n}-${tag}@firma.test`;
const emails = ["owner", "member", "solo", "new", "taken"].map(mail);

let workspaceId = "";
let projectId = "";
let owner: typeof schema.accounts.$inferSelect;
let solo: typeof schema.accounts.$inferSelect;

/** Pulls the token out of the console log line written when no SMTP is set. */
async function captureLink(fn: () => Promise<unknown>): Promise<string> {
  const orig = console.log;
  let line = "";
  console.log = (...a: unknown[]) => { line += a.join(" "); };
  try { await fn(); } finally { console.log = orig; }
  const t = /[?&]t=([\w-]+)/.exec(line)?.[1];
  if (!t) throw new Error(`no link in: ${line}`);
  return t;
}

beforeAll(async () => {
  [owner] = await db.insert(schema.accounts).values({ email: mail("owner") }).returning() as [typeof owner];
  [solo] = await db.insert(schema.accounts).values({ email: mail("solo") }).returning() as [typeof solo];
  await db.insert(schema.accounts).values({ email: mail("taken") });
  await withSystem(db, async (tx) => {
    const [w] = await tx.insert(schema.workspaces).values({ slug: `w-${tag}`, name: "Tím", plan: "free" }).returning();
    workspaceId = w!.id;
    await tx.insert(schema.workspaceMembers).values({ workspaceId, accountId: owner.id, role: "owner" });
    const [p] = await tx.insert(schema.projects).values({ workspaceId, slug: `p-${tag}`, name: "P", theme: presets.ozvi }).returning();
    projectId = p!.id;
    const [sw] = await tx.insert(schema.workspaces).values({ slug: `s-${tag}`, name: "Sólo", plan: "pro", planStatus: "active" }).returning();
    await tx.insert(schema.workspaceMembers).values({ workspaceId: sw!.id, accountId: solo.id, role: "owner" });
    await tx.insert(schema.projects).values({ workspaceId: sw!.id, slug: `s-${tag}`, name: "Sólo projekt", theme: presets.ozvi });
  });
});

afterAll(async () => {
  await withSystem(db, (tx) => tx.delete(schema.workspaces).where(inArray(schema.workspaces.slug, [`w-${tag}`, `s-${tag}`])));
  await db.delete(schema.accounts).where(inArray(schema.accounts.email, emails));
});

describe("workspace people", () => {
  it("invites by e-mail, accepts once, and the new member can be removed", async () => {
    const token = await captureLink(() => ws.invite(owner, workspaceId, mail("member"), "member"));
    expect((await ws.people(workspaceId)).pending.map((p) => p.email)).toEqual([mail("member")]);
    expect((await ws.peekInvite(token))?.workspace).toBe("Tím");

    const member = await ws.acceptInvite(token);
    expect(member.email).toBe(mail("member"));
    expect(await ws.roleIn(member.id, workspaceId)).toBe("member");
    await expect(ws.acceptInvite(token)).rejects.toThrow(/neplatí/);
    expect((await ws.people(workspaceId)).pending).toEqual([]);

    // A member cannot invite or change roles.
    await expect(ws.invite(member, workspaceId, mail("x"), "member")).rejects.toMatchObject({ code: "not_owner" });
    await expect(ws.setRole(member, workspaceId, member.id, "owner")).rejects.toMatchObject({ code: "not_owner" });
    await expect(ws.invite(owner, workspaceId, mail("member"), "member")).rejects.toThrow(/už v priestore/);

    // Board admin rights from the hand-off end when the person is removed.
    await withProject(db, projectId, (tx) => tx.insert(schema.users).values({ projectId, externalId: `email:${member.email}`, email: member.email, name: "m", role: "admin" }));
    await ws.removeMember(owner, workspaceId, member.id);
    expect(await ws.roleIn(member.id, workspaceId)).toBeNull();
    const [u] = await withProject(db, projectId, (tx) => tx.select().from(schema.users).where(eq(schema.users.externalId, `email:${member.email}`)));
    expect(u!.role).toBe("member");
    expect(u!.sessionVersion).toBe(1);

    // Every step above lands in the workspace activity log, newest first.
    const { activityOf } = await import("./activity");
    const log = (await activityOf(workspaceId)).map((r) => r.a.action);
    expect(log.slice(0, 3)).toEqual(["member.removed", "member.joined", "member.invited"]);
  });

  it("always keeps one owner", async () => {
    await expect(ws.removeMember(owner, workspaceId, owner.id)).rejects.toMatchObject({ code: "last_owner" });
    await expect(ws.setRole(owner, workspaceId, owner.id, "member")).rejects.toMatchObject({ code: "last_owner" });
  });

  it("a newer invitation replaces the old link", async () => {
    const first = await captureLink(() => ws.invite(owner, workspaceId, mail("new"), "owner"));
    const second = await captureLink(() => ws.invite(owner, workspaceId, mail("new"), "owner"));
    expect(await ws.peekInvite(first)).toBeNull();
    expect((await ws.peekInvite(second))?.role).toBe("owner");
    const p = await ws.people(workspaceId);
    await ws.revokeInvite(owner, workspaceId, p.pending[0]!.id);
    expect(await ws.peekInvite(second)).toBeNull();
  });
});

describe("account e-mail", () => {
  it("changes only after the link is opened and refuses an address that has an account", async () => {
    const token = await captureLink(() => issueEmailChange(db, solo.id, mail("new"), "https://x/app/account/email"));
    expect((await peekEmailChange(db, token))?.email).toBe(mail("new"));
    const change = await consumeEmailChange(db, token);
    await expect(consumeEmailChange(db, token)).rejects.toThrow(/neplatí/);
    const updated = await ws.applyEmailChange(change.accountId, change.email);
    expect(updated.email).toBe(mail("new"));
    await expect(ws.applyEmailChange(solo.id, mail("taken"))).rejects.toThrow(/iný účet/);
    solo = updated;
  });
});

describe("account deletion", () => {
  it("is blocked by an active subscription and by being the only owner of a shared workspace", async () => {
    const plan = await ws.deletionPlan(solo.id);
    expect(plan.remove.map((w) => w.projects)).toEqual([["Sólo projekt"]]);
    expect(plan.blockers[0]).toMatch(/predplatné/);
    await expect(ws.deleteAccount(solo)).rejects.toThrow(/predplatné/);
  });

  it("deletes solo workspaces with their projects once the subscription is cancelled", async () => {
    await db.update(schema.workspaces).set({ planStatus: "scheduled_cancel" }).where(eq(schema.workspaces.slug, `s-${tag}`));
    expect((await ws.deletionPlan(solo.id)).blockers).toEqual([]);
    await ws.deleteAccount(solo);
    expect(await db.query.accounts.findFirst({ where: eq(schema.accounts.id, solo.id) })).toBeUndefined();
    expect(await db.query.workspaces.findFirst({ where: eq(schema.workspaces.slug, `s-${tag}`) })).toBeUndefined();
    expect(await db.query.projects.findFirst({ where: eq(schema.projects.slug, `s-${tag}`) })).toBeUndefined();
  });
});

describe("deleteWorkspace", () => {
  it("lets the owner delete a workspace with its projects, never a member, never a paid one", async () => {
    const t2 = `d${Date.now().toString(36)}`;
    const [boss] = await db.insert(schema.accounts).values({ email: `boss-${t2}@firma.test` }).returning();
    const [guest] = await db.insert(schema.accounts).values({ email: `guest-${t2}@firma.test` }).returning();
    const [free, paid] = await withSystem(db, async (tx) => {
      const made = await tx.insert(schema.workspaces).values([
        { slug: `df-${t2}`, name: "Na zmazanie", plan: "free" },
        { slug: `dp-${t2}`, name: "Platený", plan: "pro", planStatus: "active", creemSubscriptionId: `sub_${t2}` },
      ]).returning();
      for (const w of made) await tx.insert(schema.workspaceMembers).values([{ workspaceId: w.id, accountId: boss!.id, role: "owner" }, { workspaceId: w.id, accountId: guest!.id, role: "member" }]);
      await tx.insert(schema.projects).values({ workspaceId: made[0]!.id, slug: `dp-proj-${t2}`, name: "Projekt", theme: presets.ozvi });
      return made;
    });
    await expect(ws.deleteWorkspace(guest!, free!.id)).rejects.toThrow();
    await expect(ws.deleteWorkspace(boss!, paid!.id)).rejects.toThrow();
    expect(await ws.deleteWorkspace(boss!, free!.id)).toEqual({ name: "Na zmazanie", projects: 1 });
    expect(await db.query.workspaces.findFirst({ where: eq(schema.workspaces.id, free!.id) })).toBeUndefined();
    expect(await db.query.projects.findFirst({ where: eq(schema.projects.slug, `dp-proj-${t2}`) })).toBeUndefined();
    expect(await db.query.workspaceMembers.findFirst({ where: eq(schema.workspaceMembers.workspaceId, free!.id) })).toBeUndefined();
    await withSystem(db, (tx) => tx.delete(schema.workspaces).where(eq(schema.workspaces.id, paid!.id)));
    await db.delete(schema.accounts).where(inArray(schema.accounts.id, [boss!.id, guest!.id]));
  });
});
