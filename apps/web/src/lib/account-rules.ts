import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

export const admins = (env: Record<string, string | undefined> = process.env) =>
  (env.OZVI_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Cloud before launch (OZVI_SIGNUP=closed): no new sign-ups, only OZVI_ADMIN_EMAILS. */
export const signupClosed = (env: Record<string, string | undefined> = process.env) => env.OZVI_SIGNUP === "closed";

/** Who may create an account: anyone in cloud (or OZVI_SIGNUP=open); in self-host or with closed sign-up only OZVI_ADMIN_EMAILS. */
export function mayCreateAccount(email: string, env: Record<string, string | undefined> = process.env): boolean {
  if (!signupClosed(env) && (env.OZVI_MODE === "cloud" || env.OZVI_SIGNUP === "open")) return true;
  return admins(env).includes(email.toLowerCase());
}

/** Operators (OZVI_ADMIN_EMAILS): never decided by the sign-up mode. */
export const isAdminEmail = (email: string, env: Record<string, string | undefined> = process.env) => admins(env).includes(email.toLowerCase());

/**
 * One free workspace per person: Gmail ignores dots and "+tags" in the local part, so
 * m.e.n.o+1@gmail.com and meno@gmail.com are one mailbox and count as one person. Only for that
 * limit; sign-in and e-mails keep the address as typed.
 */
const GMAIL = new Set(["gmail.com", "googlemail.com"]);
export function freeQuotaEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  const local = e.slice(0, at), domain = e.slice(at + 1);
  return GMAIL.has(domain) ? `${local.split("+")[0]!.replaceAll(".", "")}@gmail.com` : e;
}

/** freeQuotaEmail() in SQL, for comparing with stored account addresses. */
export const freeQuotaEmailSql = (email: SQLWrapper): SQL => sql`case when split_part(lower(${email}), '@', 2) in ('gmail.com', 'googlemail.com')
  then replace(split_part(split_part(lower(${email}), '@', 1), '+', 1), '.', '') || '@gmail.com'
  else lower(${email}) end`;
