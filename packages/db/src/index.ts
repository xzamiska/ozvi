import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };
export { ITEM_STATUSES } from "./schema";
export * from "./crypto";
export * from "./plans";

export function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle(postgres(url, { max: 10 }), { schema });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Every tenant query runs inside withProject. Row-level security (FORCE, see migrations/0001_rls.sql)
 * returns nothing and rejects writes for any other project — even if a WHERE clause is forgotten.
 */
export function withProject<T>(db: Db, projectId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('ozvi.project_id', ${projectId}, true)`);
    return fn(tx);
  });
}

/** Cross-project work (seed, import, retention jobs). Never call from a request handler. */
export function withSystem<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('ozvi.system', 'on', true)`);
    return fn(tx);
  });
}
