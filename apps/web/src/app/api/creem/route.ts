import type { NextRequest } from "next/server";
import { applyCreemEvent, creemConfig, verifyCreemSignature } from "@/lib/creem";

/** Creem webhook: plan changes for cloud workspaces. Signed (creem-signature = HMAC-SHA256 of the raw body). */
export async function POST(req: NextRequest) {
  const cfg = creemConfig();
  if (!cfg) return new Response("billing disabled", { status: 404 });
  const body = await req.text();
  if (body.length > 1_000_000) return new Response("too large", { status: 413 });
  if (!verifyCreemSignature(cfg.webhookSecret, body, req.headers.get("creem-signature"))) return new Response("bad signature", { status: 401 });
  try {
    const result = await applyCreemEvent(cfg, JSON.parse(body));
    console.log("[ozvi] creem", result);
    return new Response(result, { status: 200 });
  } catch (e) {
    console.error("[ozvi] creem webhook", e);
    return new Response("error", { status: 500 });
  }
}
