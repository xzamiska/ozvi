import { signOzviToken } from "@ozvi/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { DEV_USERS, devEnabled } from "@/lib/dev";
import { appOrigin } from "@/lib/email/url";

/** /dev/login?project=billiwo&as=team — skips the host app while developing. */
export function GET(req: NextRequest) {
  if (!devEnabled()) return new Response("Not found", { status: 404 });
  const p = req.nextUrl.searchParams;
  const project = (p.get("project") ?? "billiwo").replace(/[^a-z0-9-]/g, "");
  const as = p.get("as") === "team" ? "team" : "member";
  const token = signOzviToken(DEV_USERS[as], process.env.OZVI_SSO_SECRET ?? "");
  return NextResponse.redirect(new URL(`/${project}/sso?token=${token}&return=/${project}/ideas`, appOrigin(req.nextUrl.origin)));
}
