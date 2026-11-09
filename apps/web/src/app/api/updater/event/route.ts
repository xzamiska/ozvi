import { schema } from "@ozvi/db";
import { parseTheme, presets } from "@ozvi/theme";
import { asc } from "drizzle-orm";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { renderMail } from "@/lib/email/render";
import { projectOrigin, publicUrl } from "@/lib/email/url";
import { sendNow } from "@/lib/email/worker";
import { updaterTokenOk } from "@/lib/updater";
import { updaterMail, type UpdaterEvent } from "@/lib/updater-mail";

export const dynamic = "force-dynamic";

const TYPES = new Set<UpdaterEvent["type"]>(["available", "started", "updated", "rolledBack", "failed"]);

/**
 * Callback from the ozvi-updater sidecar (same shared OZVI_UPDATER_TOKEN). E-mails the operators in
 * OZVI_ADMIN_EMAILS; "started" is only logged. Self-host only.
 */
export async function POST(req: Request) {
  if (process.env.OZVI_MODE === "cloud") return new Response(null, { status: 404 });
  if (!updaterTokenOk(req.headers.get("authorization"))) return Response.json({ error: "unauthorized" }, { status: 401 });

  let e: UpdaterEvent;
  try {
    e = (await req.json()) as UpdaterEvent;
  } catch {
    return Response.json({ error: "json" }, { status: 400 });
  }
  if (!e || !TYPES.has(e.type)) return Response.json({ error: "type" }, { status: 400 });
  console.log(`[ozvi] updater: ${e.type} ${e.from ?? ""} → ${e.to ?? ""}${e.message ? ` (${String(e.message).slice(0, 200)})` : ""}`);

  const to = (process.env.OZVI_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
  const locale: Locale = LOCALES.includes(process.env.OZVI_ADMIN_LOCALE as Locale) ? (process.env.OZVI_ADMIN_LOCALE as Locale) : DEFAULT_LOCALE;
  const [p] = await db.select().from(schema.projects).orderBy(asc(schema.projects.createdAt)).limit(1);
  const settingsUrl = p ? `${projectOrigin(p)}/${p.slug}/admin` : null;
  const mail = updaterMail(e, { server: publicUrl(), settingsUrl }, locale);
  if (!mail || !to.length) return Response.json({ ok: true, sent: 0 });

  const rendered = renderMail(mail, parseTheme(presets.ozvi), "Ozvi", null, locale);
  let sent = 0;
  for (const addr of to) {
    try {
      if (await sendNow({ to: addr, fromName: "Ozvi", subject: rendered.subject, html: rendered.html, text: rendered.text, kind: "updater" })) sent++;
    } catch (err) {
      console.error(`[ozvi] updater mail to ${addr} failed`, err);
    }
  }
  return Response.json({ ok: true, sent });
}
