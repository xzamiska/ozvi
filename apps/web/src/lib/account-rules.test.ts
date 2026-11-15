import { createDb } from "@ozvi/db";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { freeQuotaEmail, freeQuotaEmailSql, safeAppNext } from "./account-rules";

const CASES: [string, string][] = [
  ["Meno@Gmail.com", "meno@gmail.com"],
  ["m.e.n.o+ozvi1@gmail.com", "meno@gmail.com"],
  ["meno+a+b@googlemail.com", "meno@gmail.com"],
  ["jan.novak+test@firma.sk", "jan.novak@firma.sk"],
  ["Jan.Novak+a+b@Firma.SK", "jan.novak@firma.sk"],
  ["jan.novak@firma.sk", "jan.novak@firma.sk"],
  ["+tag@firma.sk", "+tag@firma.sk"],
  ["+tag@gmail.com", "+tag@gmail.com"],
  ["\"a@b\"+x@firma.sk", "\"a@b\"@firma.sk"],
  ["no-at-sign", "no-at-sign"],
  ["@firma.sk", "@firma.sk"],
  ["  Peter@Example.COM ", "peter@example.com"],
];

describe("sign-in return path", () => {
  it("accepts console paths only", () => {
    expect(safeAppNext("/app/account/email?t=abc")).toBe("/app/account/email?t=abc");
    expect(safeAppNext("/app")).toBe("/app");
    for (const bad of ["https://evil.example/app", "//evil.example", "/apple", "/app\\evil", "/app/login?next=/app", "/x", "", undefined, 42, "/app/ x"]) {
      expect(safeAppNext(bad)).toBeNull();
    }
  });
});

describe("one free workspace per person", () => {
  it("+tags are ignored for every domain, dots only for Gmail", () => {
    for (const [input, key] of CASES) expect(freeQuotaEmail(input)).toBe(key);
  });

  it.skipIf(!process.env.DATABASE_URL)("the SQL rule matches the TypeScript one", async () => {
    const db = createDb(process.env.DATABASE_URL);
    for (const [input] of CASES) {
      const e = input.trim();
      const rows = await db.execute(sql`select ${freeQuotaEmailSql(sql`${e}::text`)} as k`) as unknown as { k: string }[] | { rows: { k: string }[] };
      const k = Array.isArray(rows) ? rows[0]!.k : rows.rows[0]!.k;
      expect(k).toBe(freeQuotaEmail(input));
    }
    // createProject serialises the free-workspace check per mailbox with this lock (as a bound parameter).
    await db.transaction((tx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ozvi:free-workspace:${freeQuotaEmail("a+b@firma.sk")}`}))`));
  });
});
