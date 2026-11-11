import { clientIp } from "@/lib/client-ip";
import { db } from "@/lib/db";
import { allow } from "@/lib/ratelimit";
import { parseReport, storeReport } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

/** Opt-in anonymous statistics from self-hosted servers (ADR-0012). Cloud only; nothing but the counts is kept. */
export async function POST(req: Request) {
  if (process.env.OZVI_MODE !== "cloud") return new Response(null, { status: 404 });
  if (!allow("telemetryIp", clientIp(req.headers))) return Response.json({ error: "too many" }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 2048) return Response.json({ error: "too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "invalid json" }, { status: 400 }); }
  const report = parseReport(body);
  if (!report) return Response.json({ error: "invalid report" }, { status: 400 });
  await storeReport(db, report);
  return new Response(null, { status: 204 });
}
