import { randomUUID } from "node:crypto";
import { createDb, schema, withSystem } from "@ozvi/db";
import { presets } from "@ozvi/theme";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { levelOf, usageAlertsTick } from "./usage-alerts";

process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
process.env.ANTHROPIC_API_KEY = "test-key-not-used";

describe("levelOf", () => {
  it("80 and 100 percent, nothing below or without a limit", () => {
    expect(levelOf(399, 500)).toBeNull();
    expect(levelOf(400, 500)).toBe(80);
    expect(levelOf(500, 500)).toBe(100);
    expect(levelOf(10, Number.POSITIVE_INFINITY)).toBeNull();
    expect(levelOf(0, 0)).toBeNull();
  });
});

const db = createDb();
const tag = `ua-${Date.now().toString(36)}`;
let projectId = "";

async function addTranslations(n: number) {
  await withSystem(db, (tx) => tx.insert(schema.contentTranslations).values(Array.from({ length: n }, () => ({
    projectId, subject: "item", subjectId: randomUUID(), sourceHash: randomUUID(), targetLocale: "en", title: "t", body: "b", model: "m",
  }))));
}

describe("usage alerts (DB)", () => {
  const mode = process.env.OZVI_MODE;
  beforeAll(async () => {
    process.env.OZVI_MODE = "cloud";
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(schema.workspaces).values({ slug: tag, name: tag, plan: "pro" }).returning();
      projectId = (await tx.insert(schema.projects).values({ workspaceId: w!.id, slug: tag, name: "Alerts", theme: presets.ozvi, defaultLocale: "en" }).returning())[0]!.id;
      const [a] = await tx.insert(schema.accounts).values({ email: `${tag}@example.com` }).returning();
      await tx.insert(schema.workspaceMembers).values({ workspaceId: w!.id, accountId: a!.id, role: "owner" });
    });
  });
  afterAll(() => { process.env.OZVI_MODE = mode; });

  it("writes to the owners once at 80 % and once at 100 % of the translations", async () => {
    const send = vi.fn(async (_m: { to: string; kind: string; subject: string }) => true);
    const mine = () => send.mock.calls.map((c) => c[0]).filter((m) => m.to === `${tag}@example.com`);
    await addTranslations(399);
    await usageAlertsTick(db, { send });
    expect(mine()).toHaveLength(0);
    await addTranslations(1);
    await usageAlertsTick(db, { send });
    await usageAlertsTick(db, { send });
    expect(mine().map((m) => m.kind)).toEqual(["usage-translations-80"]);
    expect(mine()[0]!.subject).toContain("80%");
    await addTranslations(100);
    await usageAlertsTick(db, { send });
    expect(mine().map((m) => m.kind)).toEqual(["usage-translations-80", "usage-translations-100"]);
  });
});
