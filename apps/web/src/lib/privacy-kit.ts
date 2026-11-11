import { LOCALE_TAG, type Locale } from "@/i18n/locales";

/**
 * Privacy kit (admin → Dáta projektu → #privacy-kit): copy-ready paragraphs for the privacy policy and the
 * records of processing of a company that embeds Ozvi, built from the project's ACTUAL configuration.
 * Pure and client-safe: the server collects the facts (privacy-kit-config.ts), the admin page builds the
 * text in the chosen language with the "privacyKit" messages. Not legal advice; the UI says so.
 *
 * Rules the tests hold it to: no AI recipient when AI is off; self-host never names Ozvi/Resend as a
 * processor; the storage table lists exactly the keys the widget and the board use (storage-keys.ts).
 */

export type Capture = "screenshot" | "console" | "network" | "steps" | "links";
export const CAPTURES: readonly Capture[] = ["screenshot", "console", "network", "steps", "links"];
/** What the widget sends by default (packages/widget/src/capture.ts); the host app can switch parts off. */
export const DEFAULT_CAPTURE: Record<Capture, boolean> = { screenshot: true, console: true, network: true, steps: true, links: false };

/** Who runs the model: cloud = Scaleway (EU); self-host = whatever the operator configured (or their own server). */
export type AiRecipient = { kind: "anthropic" } | { kind: "remote"; host: string | null } | { kind: "local" };

export interface StorageItem {
  name: string;
  where: "widget" | "board" | "boardTeam";
  type: "local" | "cookie" | "cookieHttpOnly";
  purpose: "seen" | "session" | "oidc" | "locale" | "csv";
  /** Seconds; null = until the person clears browser data. */
  maxAge: number | null;
}

export interface KitConfig {
  mode: "cloud" | "self";
  name: string;
  /** https://host/<slug> */
  boardUrl: string;
  signIn: { sso: boolean; email: boolean; oidc: string | null };
  ai: { recipient: AiRecipient; translation: boolean } | null;
  integrations: { github: boolean; linear: boolean; jira: boolean; hooks: { format: "json" | "slack" | "teams" | "discord"; bugs: boolean }[] };
  /** Self-host only: how e-mail leaves the instance. */
  mail: { kind: "cloud" } | { kind: "smtp"; host: string } | { kind: "ecomail" } | { kind: "none" };
  /** Self-host only: hosts of optional services that receive personal data. */
  s3: string | null;
  embeddings: string | null;
  retention: { captureDays: number | null; closedFilesDays: number | null; contactsMonths: number | null };
  /** Cloud: the Ozvi operator's legal name, or null while it is a placeholder. */
  operator: string | null;
  subprocessorsUrl: string;
  storage: StorageItem[];
  capture: Record<Capture, boolean>;
}

export type Block = { kind: "p"; text: string } | { kind: "ul"; items: string[] } | { kind: "table"; head: string[]; rows: string[][] };
export type SectionId = "purpose" | "data" | "recipients" | "retention" | "rights" | "storage";
export interface KitSection { id: SectionId; title: string; blocks: Block[] }
export interface Kit { title: string; sections: KitSection[] }

export type KitT = (key: string, values?: Record<string, string | number>) => string;

const list = (items: string[], locale: Locale) => new Intl.ListFormat(LOCALE_TAG[locale], { style: "long", type: "conjunction" }).format(items);

/** Duration in the largest whole unit (years, days, minutes). */
function duration(sec: number | null, t: KitT) {
  if (sec === null) return t("storage.untilCleared");
  if (sec % (365 * 86400) === 0) return t("units.years", { n: sec / (365 * 86400) });
  if (sec % 86400 === 0) return t("units.days", { n: sec / 86400 });
  return t("units.minutes", { n: Math.round(sec / 60) });
}

/** `short`: without the explanation in brackets, for use inside other brackets. */
function aiFeatures(cfg: KitConfig, t: KitT, locale: Locale, short = false) {
  const translate = short ? t("purpose.aiTranslateShort") : t("purpose.aiTranslate");
  return list([t("purpose.aiSummaries"), t("purpose.aiChangelog"), ...(cfg.ai?.translation ? [translate] : [])], locale);
}

/** List items end with ";" except the last one, which ends the sentence. */
const closeLists = (blocks: Block[]) => blocks.map((b) => b.kind === "ul" && b.items.length
  ? { ...b, items: [...b.items.slice(0, -1), b.items.at(-1)!.replace(/;$/, ".")] } : b);

export function buildKit(cfg: KitConfig, t: KitT, locale: Locale): Kit {
  const name = cfg.name;
  const host = new URL(cfg.boardUrl).host;
  const sections: KitSection[] = [];

  // 1. Purpose and legal basis (a suggestion to review).
  const purpose: Block[] = [
    { kind: "p", text: t("purpose.intro", { name }) },
    { kind: "ul", items: [t("purpose.bugs"), t("purpose.ideas", { name })] },
    { kind: "p", text: t("purpose.review") },
  ];
  if (cfg.ai) purpose.push({ kind: "p", text: t("purpose.ai", { features: aiFeatures(cfg, t, locale) }) });
  sections.push({ id: "purpose", title: t("sections.purpose"), blocks: purpose });

  // 2. Categories of data.
  const caps = CAPTURES.filter((c) => cfg.capture[c]).map((c) => t(`data.cap.${c}`));
  const sso = cfg.signIn.sso || (!cfg.signIn.email && !cfg.signIn.oidc);
  const data: string[] = [
    ...(sso ? [t("data.sso", { name })] : []),
    ...(cfg.signIn.oidc ? [t("data.oidc", { issuer: cfg.signIn.oidc })] : []),
    ...(cfg.signIn.email ? [t("data.email")] : []),
    t("data.content"),
    caps.length ? t("data.contextWith", { captures: list(caps, locale) }) : t("data.context"),
    t("data.mail"),
  ];
  const dataBlocks: Block[] = [{ kind: "p", text: t("data.intro") }, { kind: "ul", items: data }, { kind: "p", text: t("data.masking") }];
  if (cfg.capture.network || cfg.capture.steps || cfg.capture.links) dataBlocks.push({ kind: "p", text: t("data.optOut") });
  sections.push({ id: "data", title: t("sections.data"), blocks: dataBlocks });

  // 3. Recipients.
  const rec: Block[] = [];
  const ai = cfg.ai ? aiFeatures(cfg, t, locale, true) : null;
  if (cfg.mode === "cloud") {
    rec.push({ kind: "p", text: t("recipients.cloud", { operator: cfg.operator ?? t("recipients.operatorPlaceholder") }) });
    rec.push({ kind: "p", text: t("recipients.cloudList") });
    rec.push({ kind: "ul", items: [t("recipients.resend"), ...(ai ? [t("recipients.scaleway", { task: ai })] : [])] });
    rec.push({ kind: "p", text: t("recipients.cloudMore", { url: cfg.subprocessorsUrl }) });
  } else {
    rec.push({ kind: "p", text: t("recipients.self") });
    const own: string[] = [t("recipients.hosting")];
    if (cfg.mail.kind === "smtp") own.push(t("recipients.smtp", { host: cfg.mail.host }));
    if (cfg.mail.kind === "ecomail") own.push(t("recipients.ecomail"));
    if (cfg.s3) own.push(t("recipients.s3", { host: cfg.s3 }));
    if (cfg.embeddings) own.push(t("recipients.embeddings", { host: cfg.embeddings }));
    if (ai && cfg.ai) {
      const r = cfg.ai.recipient;
      own.push(r.kind === "anthropic" ? t("recipients.anthropic", { task: ai })
        : r.kind === "remote" ? t("recipients.aiRemote", { host: r.host ?? t("recipients.aiUnknown"), task: ai })
        : t("recipients.aiLocal", { task: ai }));
    }
    rec.push({ kind: "p", text: t("recipients.selfList") }, { kind: "ul", items: own });
  }
  const tools: string[] = [];
  if (cfg.integrations.github) tools.push(t("recipients.github"));
  if (cfg.integrations.linear) tools.push(t("recipients.linear"));
  if (cfg.integrations.jira) tools.push(t("recipients.jira"));
  const seen = new Set<string>();
  for (const h of cfg.integrations.hooks) {
    const key = `${h.format}:${h.bugs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bugs = h.bugs ? "yes" : "no";
    tools.push(h.format === "json" ? t("recipients.webhook", { bugs }) : t("recipients.chat", { channel: t(`recipients.channel.${h.format}`), bugs }));
  }
  if (tools.length) rec.push({ kind: "p", text: t("recipients.toolsIntro") }, { kind: "ul", items: tools });
  rec.push({ kind: "p", text: t(cfg.mode === "cloud" ? "recipients.noTrackingCloud" : "recipients.noTrackingSelf") });
  sections.push({ id: "recipients", title: t("sections.recipients"), blocks: rec });

  // 4. Retention.
  const r = cfg.retention;
  const ret: string[] = [
    t("retention.content"),
    r.captureDays ? t("retention.capture", { days: r.captureDays }) : t("retention.captureKeep"),
    ...(r.closedFilesDays ? [t("retention.files", { days: r.closedFilesDays })] : []),
    ...(r.contactsMonths ? [t("retention.contacts", { months: r.contactsMonths })] : []),
    t("retention.end"),
  ];
  sections.push({ id: "retention", title: t("sections.retention"), blocks: [{ kind: "ul", items: ret }] });

  // 5. Rights.
  const me = `${cfg.boardUrl}/me`;
  sections.push({ id: "rights", title: t("sections.rights"), blocks: [
    { kind: "p", text: t("rights.self", { myData: t("rights.myData"), url: me }) },
    { kind: "p", text: t("rights.unsubscribe", { myData: t("rights.myData") }) },
    { kind: "p", text: t("rights.other") },
  ] });

  // 6. Browser storage.
  const where = (w: StorageItem["where"]) => w === "widget" ? t("storage.whereWidget", { name }) : w === "board" ? t("storage.whereBoard", { host }) : t("storage.whereBoardTeam", { host });
  const purposeOf = (s: StorageItem) => t(`storage.purpose.${s.purpose}`, { issuer: cfg.signIn.oidc ?? "" });
  sections.push({ id: "storage", title: t("sections.storage"), blocks: [
    { kind: "p", text: t("storage.intro") },
    { kind: "table", head: [t("storage.head.name"), t("storage.head.where"), t("storage.head.type"), t("storage.head.purpose"), t("storage.head.duration")],
      rows: cfg.storage.map((s) => [s.name, where(s.where), t(`storage.type.${s.type}`), purposeOf(s), duration(s.maxAge, t)]) },
    { kind: "p", text: t("storage.widgetNote") },
  ] });

  return { title: t("title", { name }), sections: sections.map((x) => ({ ...x, blocks: closeLists(x.blocks) })) };
}

/* ---------- Output formats ---------- */

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function blockMd(b: Block): string {
  if (b.kind === "p") return b.text;
  if (b.kind === "ul") return b.items.map((i) => `- ${i}`).join("\n");
  const row = (r: string[], code = false) => `| ${r.map((c, i) => (code && i === 0 ? `\`${mdCell(c)}\`` : mdCell(c))).join(" | ")} |`;
  return [row(b.head), `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => row(r, true))].join("\n");
}

export const sectionMarkdown = (s: KitSection) => [`### ${s.title}`, ...s.blocks.map(blockMd)].join("\n\n");
export const kitMarkdown = (k: Kit) => [`## ${k.title}`, ...k.sections.map(sectionMarkdown)].join("\n\n") + "\n";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Escaped text with bare https:// URLs as links (trailing punctuation stays outside). */
export const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<]+?(?=[.,;:)]?(?:\s|$))/g, (u) => `<a href="${u}">${u}</a>`);

function blockHtml(b: Block): string {
  if (b.kind === "p") return `<p>${linkify(b.text)}</p>`;
  if (b.kind === "ul") return `<ul>\n${b.items.map((i) => `  <li>${linkify(i)}</li>`).join("\n")}\n</ul>`;
  return `<table>\n  <thead><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>\n  <tbody>\n${b.rows.map((r) => `    <tr>${r.map((c, i) => `<td>${i === 0 ? `<code>${esc(c)}</code>` : esc(c)}</td>`).join("")}</tr>`).join("\n")}\n  </tbody>\n</table>`;
}

export const sectionHtml = (s: KitSection) => [`<h3>${esc(s.title)}</h3>`, ...s.blocks.map(blockHtml)].join("\n");
export const kitHtml = (k: Kit) => [`<h2>${esc(k.title)}</h2>`, ...k.sections.map(sectionHtml)].join("\n") + "\n";
