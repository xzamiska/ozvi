import { createDb } from "@ozvi/db";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { freeQuotaEmail, freeQuotaEmailSql } from "./account-rules";

const CASES: [string, string][] = [
  ["Meno@Gmail.com", "meno@gmail.com"],
  ["m.e.n.o+ozvi1@gmail.com", "meno@gmail.com"],
  ["meno+a+b@googlemail.com", "meno@gmail.com"],
  ["jan.novak+test@firma.sk", "jan.novak+test@firma.sk"],
  ["  Peter@Example.COM ", "peter@example.com"],
];

describe("one free workspace per person", () => {
  it("Gmail ignores dots and +tags; other domains keep the address", () => {
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
  });
});
