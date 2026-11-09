import type { Transporter } from "nodemailer";

/**
 * Ecomail (ecomail.cz) transactional API as a mail transport — for operators who send through
 * Ecomail instead of SMTP. Set ECOMAIL_API_KEY (paid account, verified sending domain).
 *
 * Limits of the API: no custom headers, so the RFC 8058 List-Unsubscribe header cannot be sent
 * (every e-mail still has the unsubscribe link in its footer). Click and open tracking are always
 * off: tracking would rewrite sign-in links and ping a third party on every open.
 */

const ENDPOINT = "https://api2.ecomailapp.cz/transactional/send-message";

/** '"Billiwo" <feedback@billiwo.com>' → { name, email } */
export function parseFrom(from: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1]!.trim(), email: m[2]!.trim() } : { name: "", email: from.trim() };
}

interface Msg { from: string; to: string; subject: string; html?: string; text?: string; headers?: Record<string, string> }

export function ecomailTransport(apiKey: string, f: typeof fetch = fetch): Transporter {
  const sendMail = async (m: Msg) => {
    const from = parseFrom(m.from);
    const res = await f(ENDPOINT, {
      method: "POST",
      headers: { key: apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: m.subject, from_name: from.name || from.email, from_email: from.email,
          html: m.html, text: m.text, to: [{ email: m.to }],
          options: { click_tracking: false, open_tracking: false },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Ecomail ${res.status}: ${body.slice(0, 200)}`);
    const r = JSON.parse(body) as { results?: { total_accepted_recipients?: number; id?: number } };
    if (!r.results?.total_accepted_recipients) throw new Error(`Ecomail rejected the recipient: ${body.slice(0, 200)}`);
    return { messageId: String(r.results.id ?? "") };
  };
  return { sendMail } as unknown as Transporter;
}
