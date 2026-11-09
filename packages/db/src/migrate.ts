import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://ozvi:ozvi@localhost:5446/ozvi";
const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: process.env.OZVI_MIGRATIONS ?? new URL("../migrations", import.meta.url).pathname });
await client.end();
console.log("migrations applied");
