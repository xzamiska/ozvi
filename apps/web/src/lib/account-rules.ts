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
 * Where the console sign-in returns to (?next=, e.g. an e-mail change link opened while signed out): only a
 * path of the console itself, never another site or host.
 */
export function safeAppNext(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 1000) return null;
  return /^\/app(?:[/?#]|$)/.test(v) && !/[\\\s\u0000-\u001f]/.test(v) && !v.startsWith("/app/login") ? v : null;
}

/**
 * One free workspace per person: a "+tag" in the local part reaches the same mailbox at most providers
 * (meno+1@firma.sk = meno@firma.sk), and Gmail also ignores dots (m.e.n.o@gmail.com = meno@gmail.com,
 * googlemail.com = gmail.com), so those count as one person. Only for that limit; sign-in and e-mails
 * keep the address as typed.
 */
const GMAIL = new Set(["gmail.com", "googlemail.com"]);
export function freeQuotaEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  const local = e.slice(0, at), domain = e.slice(at + 1);
  // "+tag@…" with nothing before the plus keeps its local part (there is no base mailbox to fold into).
  const base = local.split("+")[0] || local;
  return GMAIL.has(domain) ? `${base.replaceAll(".", "")}@gmail.com` : `${base}@${domain}`;
}

/** freeQuotaEmail() in SQL, for comparing with stored account addresses (the stored ones are trimmed). */
export const freeQuotaEmailSql = (email: SQLWrapper): SQL => {
  const e = sql`lower(${email})`;
  const domain = sql`substring(${e} from '@([^@]*)$')`;
  const local = sql`substring(${e} from '^(.*)@[^@]*$')`;
  const base = sql`coalesce(nullif(split_part(${local}, '+', 1), ''), ${local})`;
  return sql`case when ${local} is null or ${local} = '' then ${e}
    when ${domain} in ('gmail.com', 'googlemail.com') then replace(${base}, '.', '') || '@gmail.com'
    else ${base} || '@' || ${domain} end`;
};
