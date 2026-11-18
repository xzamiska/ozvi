/**
 * Vitest global setup (packages/db, apps/web): DB tests get their own database, ozvi_test, created and migrated
 * here, never the `ozvi` database `pnpm dev` runs on (shared rows and the dev server's workers made tests flaky:
 * QA audit 17 Nov 2026). An explicit DATABASE_URL (CI) is used as it is. Without a local Postgres nothing happens
 * and the DB tests skip as before.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const TEST_DATABASE_URL = "postgres://ozvi:ozvi@localhost:5446/ozvi_test";
const ADMIN = "postgres://postgres:postgres@localhost:5446";
const quiet = { max: 1, onnotice: () => {}, connect_timeout: 3 };

/** For vitest.config `test.env`: the test database unless DATABASE_URL was set explicitly. */
export const testEnv = () => (process.env.DATABASE_URL ? {} : { DATABASE_URL: TEST_DATABASE_URL });

export default async function setup() {
  if (process.env.DATABASE_URL) return;
  const admin = postgres(`${ADMIN}/postgres`, quiet);
  try {
    const [found] = await admin`select 1 as ok from pg_database where datname = 'ozvi_test'`;
    if (!found) {
      await admin.unsafe("CREATE DATABASE ozvi_test OWNER ozvi");
      const ext = postgres(`${ADMIN}/ozvi_test`, quiet);
      await ext.unsafe("CREATE EXTENSION IF NOT EXISTS vector");
      await ext.end();
    }
  } catch {
    return; // no local Postgres (docker compose not running): DB tests skip
  } finally {
    await admin.end();
  }
  const client = postgres(TEST_DATABASE_URL, quiet);
  await migrate(drizzle(client), { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
  await client.end();
}
