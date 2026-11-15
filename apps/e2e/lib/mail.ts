import { expect } from "@playwright/test";
import { E2E } from "./env";

interface Msg { ID: string; Subject: string; Created: string }

/** The newest e-mail to an address (waits for it), with its text body. */
export async function lastMail(to: string, opts: { subject?: RegExp; timeout?: number } = {}) {
  let found: (Msg & { text: string; html: string }) | null = null;
  await expect.poll(async () => {
    const r = await fetch(`${E2E.mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=10`);
    const list = ((await r.json()) as { messages: Msg[] }).messages ?? [];
    const m = list.find((x) => !opts.subject || opts.subject.test(x.Subject));
    if (!m) return false;
    const full = (await (await fetch(`${E2E.mailpit}/api/v1/message/${m.ID}`)).json()) as { Text: string; HTML: string };
    found = { ...m, text: full.Text, html: full.HTML };
    return true;
  }, { timeout: opts.timeout ?? 20_000, message: `e-mail to ${to}` }).toBe(true);
  return found!;
}

/** How many e-mails an address got (for "nothing was sent" checks). */
export async function mailCount(to: string): Promise<number> {
  const r = await fetch(`${E2E.mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}&limit=50`);
  return (((await r.json()) as { messages: Msg[] }).messages ?? []).length;
}

export const codeIn = (text: string) => text.match(/\b(\d{6})\b/)?.[1] ?? null;
export const linkIn = (text: string, path: RegExp) => text.match(new RegExp(`https?://\\S*${path.source}\\S*`))?.[0] ?? null;
