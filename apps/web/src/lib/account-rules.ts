/** Who may create an account: anyone in cloud (or OZVI_SIGNUP=open); in self-host only OZVI_ADMIN_EMAILS. */
export function mayCreateAccount(email: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.OZVI_MODE === "cloud" || env.OZVI_SIGNUP === "open") return true;
  return (env.OZVI_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

