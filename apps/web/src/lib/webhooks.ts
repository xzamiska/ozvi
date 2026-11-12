import { createHmac, randomUUID } from "node:crypto";
import { decryptSecret, schema, withSystem, type Db } from "@ozvi/db";
import { and, eq, inArray, lt, lte, or } from "drizzle-orm";
import { isLocale, type Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { checkUrl, safeFetch } from "./net";
import { markdownToText } from "./markdown";

/**
 * Webhook delivery worker (outbox rows from events.ts). JSON deliveries are signed twice (same secret):
 *   Ozvi-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">          (original, kept for existing receivers)
 *   webhook-id / webhook-timestamp / webhook-signature: v1,<base64 …>       (Standard Webhooks, standardwebhooks.com)
 * The Standard Webhooks key is the secret's 32 bytes (base64url-decoded), i.e. "whsec_" + standard base64 of them.
 * Chat formats: Slack { text } (also Mattermost, Rocket.Chat, Discord /slack), Microsoft Teams Adaptive Card,
 * Discord embeds. Chat bodies are written in the board's default language.
 */

const { webhookDeliveries, webhooks } = schema;
const BATCH = 10;
const MAX_ATTEMPTS = 6;

export function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

/** Standard Webhooks signing key: the secret shown to the admin is base64url of 32 random bytes. */
export const standardKey = (secret: string) => Buffer.from(secret, "base64url");
/** The same secret in the "whsec_…" form Standard Webhooks libraries expect. */
export const standardSecret = (secret: string) => `whsec_${standardKey(secret).toString("base64")}`;

/** Standard Webhooks headers: id stays the same across retries of one delivery, so receivers can dedupe. */
export function standardHeaders(secret: string, id: string, body: string, t = Math.floor(Date.now() / 1000)): Record<string, string> {
  const sig = createHmac("sha256", standardKey(secret)).update(`${id}.${t}.${body}`).digest("base64");
  return { "webhook-id": id, "webhook-timestamp": String(t), "webhook-signature": `v1,${sig}` };
}

interface Payload {
  event: string; project: { name: string }; actor: { name: string } | null;
  item: { number: number; kind: string; title: string; status: string; url: string; fixedInVersion: string | null };
  comment?: { body: string }; mergedInto?: { number: number }; link?: { ref: string };
  entry?: { title: string; url: string; version: string | null };
  ai?: { generated: boolean; reviewedBy?: string | null };
}

type RefFmt = (url: string, label: string) => string;
const slackRef: RefFmt = (url, label) => `<${url}|${label.replace(/[<>&]/g, "")}>`;

/** One chat line for an event; `ref` formats links (Slack `<url|label>`, plain label for cards). */
function chatLine(p: Payload, locale: Locale, ref: RefFmt): string {
  const t = translator(locale, "integrations");
  if (p.event === "changelog.published" && p.entry) {
    return `${t("slack.changelog", { title: ref(p.entry.url, p.entry.title) })}${p.ai?.generated ? ` (${t("slack.aiAssisted")})` : ""}`;
  }
  const status = (s: string) => { const k = `slack.status.${s}` as "slack.status.new"; return t.has(k) ? t(k) : s; };
  const what = p.item.kind === "bug" ? t("slack.bug") : t("slack.idea");
  const r = ref(p.item.url, `#${p.item.number} ${p.item.title}`);
  const who = p.actor?.name ? `${p.actor.name}: ` : "";
  switch (p.event) {
    case "item.created": return p.item.kind === "bug" ? t("slack.createdBug", { who, ref: r }) : t("slack.createdIdea", { who, ref: r });
    case "item.status_changed": return `${t("slack.status_", { what, ref: r, status: status(p.item.status) })}${p.item.fixedInVersion ? ` (v${p.item.fixedInVersion})` : ""}`;
    case "comment.created": return t("slack.comment", { who, ref: r });
    case "item.merged": return t("slack.merged", { ref: r, n: String(p.mergedInto?.number) });
    case "item.linked": return t("slack.linked", { ref: r, link: String(p.link?.ref) });
    case "item.tags_changed": return t("slack.tags", { ref: r, tags: (p.item as { tags?: string[] }).tags?.join(", ") || "—" });
    default: return `${p.event}: ${r}`;
  }
}

const quoteOf = (p: Payload) => p.event === "comment.created" ? markdownToText(p.comment?.body ?? "").slice(0, 300) : "";

/** Chat message text, in the board's default language. */
export function slackText(p: Payload, locale: Locale = "sk"): string {
  const line = chatLine(p, locale, slackRef);
  const q = quoteOf(p);
  return p.event === "comment.created" ? `${line}\n> ${q.replace(/\n/g, "\n> ")}` : line;
}

/** Stage tone → card accent (Discord embed colour; same hues as the route). */
const TONE: Record<string, number> = { wait: 0x8a8f98, ack: 0x3b82f6, work: 0xf59e0b, done: 0x16a34a, off: 0x6b7280 };
function toneColor(p: Payload): number {
  if (p.event === "changelog.published") return TONE.done!;
  const s = p.item?.status;
  if (s === "declined" || s === "wont_fix") return TONE.off!;
  if (s === "fixed" || s === "verified" || s === "shipped") return TONE.done!;
  if (s === "in_progress") return TONE.work!;
  if (s === "planned" || s === "confirmed") return TONE.ack!;
  return TONE.wait!;
}

/** Where the message points and what the button says. */
function target(p: Payload, locale: Locale) {
  const t = translator(locale, "integrations");
  return p.event === "changelog.published" && p.entry
    ? { url: p.entry.url, title: p.entry.title, open: t("chatCard.openUpdate") }
    : { url: p.item.url, title: `#${p.item.number} ${p.item.title}`, open: t("chatCard.open") };
}

/** Discord: everything users wrote stays inert (no @everyone / role pings, no masked links in the title). */
const discordEscape = (s: string) => s.replace(/([\\*_~`|>\[\]()])/g, "\\$1").replace(/@/g, "@\u200b");

/** Microsoft Teams (Workflows "post to a channel when a webhook request is received", or a classic incoming webhook): Adaptive Card. */
export function teamsMessage(p: Payload, locale: Locale = "sk", projectName?: string) {
  const to = target(p, locale);
  const q = quoteOf(p);
  // Adaptive Card TextBlocks render a Markdown subset: user text must not turn into a link (spoofed target).
  const esc = (s: string) => s.replace(/\]\s*\(/g, "] (").replace(/<(?=https?:)/gi, "‹");
  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        msteams: { width: "Full" },
        body: [
          ...(projectName ? [{ type: "TextBlock", text: esc(projectName), size: "Small", isSubtle: true, wrap: true }] : []),
          { type: "TextBlock", text: esc(chatLine(p, locale, (_u, label) => label)), weight: "Bolder", wrap: true },
          ...(q ? [{ type: "TextBlock", text: esc(q), wrap: true, isSubtle: true, maxLines: 6 }] : []),
        ],
        actions: [{ type: "Action.OpenUrl", title: to.open, url: to.url }],
      },
    }],
  };
}

/** Discord webhook: one embed, mentions disabled. */
export function discordMessage(p: Payload, locale: Locale = "sk", projectName?: string) {
  const to = target(p, locale);
  const q = quoteOf(p);
  const line = chatLine(p, locale, (_u, label) => label);
  // The chat texts mark the new status Slack-style (*planned*); escaping would show the asterisks, so in
  // Discord that one span (our own word, never user text) becomes bold after the rest is made inert.
  let body = discordEscape(line);
  if (p.event === "item.status_changed") {
    const t = translator(locale, "integrations");
    const k = `slack.status.${p.item.status}` as "slack.status.new";
    const word = discordEscape(t.has(k) ? t(k) : p.item.status);
    body = body.replace(`\\*${word}\\*`, `**${word}**`);
  }
  return {
    allowed_mentions: { parse: [] as string[] },
    embeds: [{
      title: to.title.slice(0, 256),
      url: to.url,
      description: [body, q && q.split("\n").map((l) => `> ${discordEscape(l)}`).join("\n")].filter(Boolean).join("\n\n").slice(0, 4000),
      color: toneColor(p),
      ...(projectName ? { footer: { text: projectName.slice(0, 200) } } : {}),
    }],
  };
}

/** Request body for a hook in its format. */
export function chatBody(format: string, payload: unknown, locale: Locale): string {
  const p = payload as Payload;
  if (format === "slack") return JSON.stringify({ text: slackText(p, locale) });
  if (format === "teams") return JSON.stringify(teamsMessage(p, locale, p.project?.name));
  if (format === "discord") return JSON.stringify(discordMessage(p, locale, p.project?.name));
  return JSON.stringify(payload);
}

export { isPrivateAddress } from "./net";

/** Checked when saving; delivery goes through safeFetch, which re-checks every connection. */
export async function checkTarget(url: string, mode = process.env.OZVI_MODE ?? "self"): Promise<string | null> {
  return checkUrl(url, mode);
}

export async function deliver(
  hook: typeof webhooks.$inferSelect, payload: unknown, f: Fetcher = safeFetch, deliveryId?: string, locale: Locale = "sk",
): Promise<{ ok: boolean; code: number | null; error?: string }> {
  const body = chatBody(hook.format, payload, locale);
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Ozvi-Webhook/1" };
  if (hook.format === "json") {
    const secret = decryptSecret(hook.secretEnc);
    const t = Math.floor(Date.now() / 1000);
    headers["ozvi-signature"] = sign(secret, body, t);
    headers["ozvi-event"] = (payload as Payload).event;
    if (deliveryId) headers["ozvi-delivery"] = deliveryId;
    Object.assign(headers, standardHeaders(secret, deliveryId ? `msg_${deliveryId}` : `msg_test_${randomUUID()}`, body, t));
  }
  try {
    const res = await f(hook.url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return res.status >= 200 && res.status < 300 ? { ok: true, code: res.status } : { ok: false, code: res.status, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, code: null, error: e instanceof Error ? e.message.slice(0, 200) : "network error" };
  }
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const LEASE_MS = 2 * 60_000;
/** Stored as the delivery's last error (shown raw in the console), like "HTTP 500" or "network error". */
const DISABLED = "webhook disabled";
let lastCleanup = 0;

/**
 * Claim a batch (short transaction: push send_after out as a lease), deliver without holding
 * locks, then record results. A crashed worker's lease simply expires and the row is retried.
 */
export async function webhookTick(db: Db, f: Fetcher = safeFetch) {
  const batch = await withSystem(db, async (tx) => {
    const rows = await tx.select({ d: webhookDeliveries, hook: webhooks, locale: schema.projects.defaultLocale }).from(webhookDeliveries)
      .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
      .innerJoin(schema.projects, eq(schema.projects.id, webhooks.projectId))
      .where(and(eq(webhookDeliveries.status, "queued"), lte(webhookDeliveries.sendAfter, new Date())))
      .orderBy(webhookDeliveries.createdAt).limit(BATCH)
      .for("update", { skipLocked: true, of: webhookDeliveries });
    if (rows.length) {
      await tx.update(webhookDeliveries).set({ sendAfter: new Date(Date.now() + LEASE_MS) })
        .where(inArray(webhookDeliveries.id, rows.map((r) => r.d.id)));
    }
    return rows;
  });

  const results = await Promise.all(batch.map(async ({ d, hook, locale }) => ({
    d, r: hook.active ? await deliver(hook, d.payload, f, d.id, isLocale(locale) ? locale : "sk") : { ok: false, code: null, error: DISABLED },
  })));

  if (results.length) {
    await withSystem(db, async (tx) => {
      for (const { d, r } of results) {
        const attempts = d.attempts + 1;
        const giveUp = !r.ok && (attempts >= MAX_ATTEMPTS || r.error === DISABLED);
        await tx.update(webhookDeliveries).set({
          attempts,
          responseCode: r.code,
          lastError: r.error ?? null,
          status: r.ok ? "sent" : giveUp ? "failed" : "queued",
          sentAt: r.ok ? new Date() : null,
          // retry after 1, 4, 9, 16, 25 minutes
          sendAfter: r.ok || giveUp ? new Date() : new Date(Date.now() + attempts * attempts * 60_000),
        }).where(eq(webhookDeliveries.id, d.id));
      }
    });
  }

  // Housekeeping once an hour: keep 30 days of history.
  if (Date.now() - lastCleanup > 3_600_000) {
    lastCleanup = Date.now();
    await withSystem(db, (tx) => tx.delete(webhookDeliveries).where(and(
      or(eq(webhookDeliveries.status, "sent"), eq(webhookDeliveries.status, "failed")),
      lt(webhookDeliveries.createdAt, new Date(Date.now() - 30 * 86_400_000)),
    )));
  }
  return results.length;
}
