import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const mode = process.env.OZVI_MODE === "cloud" ? "cloud" : "self";
  try {
    const [r] = await db.execute<{ rls: boolean }>(
      sql`select not (rolsuper or rolbypassrls) as rls from pg_roles where rolname = current_user`);
    // RLS is our second line of tenant isolation; a superuser connection silently disables it.
    return Response.json({ ok: !!r?.rls, mode, db: "up", rls: r?.rls ? "on" : "bypassed" }, { status: r?.rls ? 200 : 500 });
  } catch {
    return Response.json({ ok: false, mode, db: "down" }, { status: 503 });
  }
}
