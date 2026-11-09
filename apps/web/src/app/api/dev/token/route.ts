import { signOzviToken } from "@ozvi/sdk";
import type { NextRequest } from "next/server";
import { DEV_USERS, devEnabled } from "@/lib/dev";

/** Plays the host app's token endpoint for /demo. */
export function GET(req: NextRequest) {
  if (!devEnabled()) return new Response("Not found", { status: 404 });
  const as = req.nextUrl.searchParams.get("as") === "team" ? "team" : "member";
  return Response.json({ token: signOzviToken(DEV_USERS[as], process.env.OZVI_SSO_SECRET ?? "") });
}
