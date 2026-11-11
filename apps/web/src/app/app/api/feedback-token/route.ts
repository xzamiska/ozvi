import { decryptSecret } from "@ozvi/db";
import { signOzviToken } from "@ozvi/sdk";
import { getAccount } from "@/lib/account";
import { ownFeedback } from "@/lib/own-feedback";

export const dynamic = "force-dynamic";

/**
 * Token URL for the console's own feedback widget: the signed-in console account becomes a user
 * of Ozvi's own board, like any host app signs in its users (ADR-0005). Operators listed in
 * OZVI_ADMIN_EMAILS are the board's team.
 */
export async function GET() {
  const account = await getAccount();
  if (!account) return Response.json({ error: "sign in" }, { status: 401 });
  const own = await ownFeedback();
  if (!own?.project.ssoSecretEnc) return Response.json({ error: "no board" }, { status: 404 });
  const team = (process.env.OZVI_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).includes(account.email.toLowerCase());
  const token = signOzviToken(
    // The same id the console → board hand-off uses, so one person is one user there (admin or not).
    { id: `email:${account.email.toLowerCase()}`, email: account.email, name: account.name ?? undefined, ...(team ? { role: "admin" } : {}) },
    decryptSecret(own.project.ssoSecretEnc),
  );
  return Response.json({ token }, { headers: { "cache-control": "no-store" } });
}
