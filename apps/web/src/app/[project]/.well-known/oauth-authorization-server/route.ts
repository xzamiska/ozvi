import type { NextRequest } from "next/server";
import { asMetadata } from "@/lib/oauth-meta";

/** Some clients append the well-known path to the issuer instead (/<slug>/.well-known/…). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  return asMetadata(req, (await params).project);
}
