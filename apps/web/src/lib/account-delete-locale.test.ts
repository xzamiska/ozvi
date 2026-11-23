import { createDb, schema } from "@ozvi/db";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Closing the account lands on the landing in the language the person used the console in. */

const me = vi.hoisted(() => ({ account: undefined as unknown, locale: "en" }));

vi.mock("./account", async (orig) => ({ ...(await orig<typeof import("./account")>()), getAccount: async () => me.account }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/i18n/server", () => ({ requestLocale: async () => me.locale }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));

const { deleteAccountAction } = await import("./account-actions");

const db = createDb(process.env.DATABASE_URL);
const up = await db.execute(sql`select 1`).then(() => true, () => false);
const run = Date.now().toString(36);

afterEach(() => { delete process.env.OZVI_MODE; });

describe.skipIf(!up)("deleteAccountAction", () => {
  for (const [locale, landing] of [["en", "/en"], ["sk", "/"], ["de", "/de"]] as const) {
    it(`goes to the ${locale} landing`, async () => {
      process.env.OZVI_MODE = "cloud";
      const email = `del-${locale}-${run}@example.com`;
      const [a] = await db.insert(schema.accounts).values({ email }).returning();
      me.account = a;
      me.locale = locale;
      const f = new FormData();
      f.set("confirm", email);
      const err = await deleteAccountAction({}, f).then(() => null, (e: { url?: string }) => e);
      expect(err?.url).toBe(`${landing}?deleted=1`);
      expect(await db.query.accounts.findFirst({ where: eq(schema.accounts.id, a!.id) })).toBeUndefined();
    });
  }
});
