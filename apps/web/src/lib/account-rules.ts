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
