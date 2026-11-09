import "server-only";
import { cookies } from "next/headers";
import { cookieName, decodeSession, encodeSession, MAX_AGE, type Session } from "./session-core";

export { cookieName, decodeSession, encodeSession, safeReturn, type Session } from "./session-core";

export async function readSession(slug: string, projectId: string): Promise<Session | null> {
  const s = decodeSession((await cookies()).get(cookieName(slug))?.value);
  return s && s.p === projectId ? s : null;
}

export function sessionCookie(slug: string, user: { id: string; sessionVersion: number }, projectId: string) {
  return {
    name: cookieName(slug),
    value: encodeSession({ u: user.id, p: projectId, v: user.sessionVersion, exp: Math.floor(Date.now() / 1000) + MAX_AGE }),
    httpOnly: true,
    sameSite: "lax" as const,
    // Secure whenever the public URL is https; plain-http self-hosts (LAN, localhost) still work.
    secure: (process.env.PUBLIC_URL ?? "").startsWith("https://"),
    path: `/${slug}`,
    maxAge: MAX_AGE,
  };
}
