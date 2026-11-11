import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

/**
 * Tenancy: workspace (who pays) → project (one board + widget, e.g. "Billiwo") → everything else.
 * Every tenant table carries project_id so row-level security can be added with one policy shape (ADR-0004).
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const plan = pgEnum("plan", ["self", "free", "pro", "studio"]);
export const itemKind = pgEnum("item_kind", ["bug", "idea"]);
/** One enum for both spaces; which values are valid per kind is enforced in the app (ITEM_STATUSES). */
export const itemStatus = pgEnum("item_status", [
  "new", "confirmed", "in_progress", "fixed", "verified", "wont_fix", // bugs
  "open", "planned", "shipped", "declined", // ideas (+ in_progress)
]);
export const userRole = pgEnum("user_role", ["member", "team", "admin"]);

export const ITEM_STATUSES = {
  bug: ["new", "confirmed", "in_progress", "fixed", "verified", "wont_fix"],
  idea: ["open", "planned", "in_progress", "shipped", "declined"],
} as const satisfies Record<"bug" | "idea", readonly (typeof itemStatus.enumValues)[number][]>;

export const workspaces = pgTable("workspaces", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  plan: plan("plan").notNull().default("self"),
  /** Cloud billing (Creem). Plan changes only through verified Creem webhooks. */
  creemCustomerId: text("creem_customer_id"),
  creemSubscriptionId: text("creem_subscription_id").unique(),
  planStatus: text("plan_status"),
  planPeriodEnd: timestamp("plan_period_end", { withTimezone: true }),
  /** created_at of the last applied Creem event: older (late or replayed) events are ignored. */
  creemEventAt: timestamp("creem_event_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const projects = pgTable("projects", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  /** Globally unique: URLs (/billiwo) and session cookies (ozvi_billiwo) are keyed by slug alone. */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Validated by @ozvi/theme before write. */
  theme: jsonb("theme").notNull(),
  /** Unique only once verified (partial index below), so an unverified claim cannot block the real owner. */
  customDomain: text("custom_domain"),
  /** Set once DNS points at us; only verified domains get TLS certificates and routing. */
  customDomainVerifiedAt: timestamp("custom_domain_verified_at", { withTimezone: true }),
  /** People can sign in with an e-mailed code / link (for boards without a host app). */
  emailLogin: boolean("email_login").notNull().default(false),
  /** Last weekly team digest e-mail (Mondays), so it goes out once per week per project. */
  teamDigestAt: timestamp("team_digest_at", { withTimezone: true }),
  /** Public ideas board on/off; the bug space is always private. */
  ideasPublic: boolean("ideas_public").notNull().default(true),
  /** The board's own favicon (storage key, changes with every new icon, so it doubles as a cache key). Null = a letter in the accent colour. */
  faviconKey: text("favicon_key"),
  faviconType: text("favicon_type"),
  /** GitHub App installation this board is connected through: lets the app's one webhook find the board. */
  githubInstallationId: bigint("github_installation_id", { mode: "number" }),
  /** Where "Prihlásiť sa" sends people: a host-app URL that redirects back to /<slug>/sso?token=… */
  loginUrl: text("login_url"),
  /** SSO signing secret, AES-256-GCM encrypted with OZVI_SECRET_KEY (see crypto.ts). */
  ssoSecretEnc: text("sso_secret_enc"),
  /** Origins allowed to call the widget API (CORS), e.g. https://app.billiwo.com */
  allowedOrigins: text("allowed_origins").array().notNull().default(sql`'{}'::text[]`),
  /** Last issued item number; bumped atomically with UPDATE … RETURNING. */
  itemSeq: integer("item_seq").notNull().default(0),
  /** Optional OpenID Connect login (alternative to host-app SSO tokens). Secret AES-GCM encrypted. */
  oidcIssuer: text("oidc_issuer"),
  oidcClientId: text("oidc_client_id"),
  oidcClientSecretEnc: text("oidc_client_secret_enc"),
  /** Board languages (sk|cs|en|pl|hu|de): the default, and which ones visitors may get or pick. */
  defaultLocale: text("default_locale").notNull().default("sk"),
  locales: text("locales").array().notNull().default(sql`'{sk,cs,en}'::text[]`),
  /** New ideas from people outside the team wait in a moderation queue until the team approves them. */
  moderateIdeas: boolean("moderate_ideas").notNull().default(false),
  /** Voting: "simple" (one upvote) or "importance" (nice to have / important / critical = vote weight 1–3). */
  voteMode: text("vote_mode").notNull().default("simple"),
  /** Vote points per person across active ideas (open, planned, in progress); a vote costs its weight. Null = unlimited. */
  voteBudget: integer("vote_budget"),
  /**
   * Admin renames of the fixed route stops, per kind and locale: { idea: { planned: { sk: "…", en: "…" } } }.
   * Display only; the stage (items.status) stays the source of truth for e-mails, roadmap and automation.
   */
  statusLabels: jsonb("status_labels").notNull().default({}),
  /** Team queue "Bez odpovede": items waiting this many days for a public team reply or status change. */
  unansweredDays: integer("unanswered_days").notNull().default(7),
  /** MCP/API lockdown: bodies written by people outside the team who are not verified are withheld from agents. */
  mcpLockdown: boolean("mcp_lockdown").notNull().default(false),
  /** Retention (admin → Dáta): days to keep bug capture data (network log, steps, console, session links, screenshots). Null = keep forever. */
  retentionCaptureDays: integer("retention_capture_days").default(180),
  /** Days after a bug is closed (fixed/verified/wont_fix) before its attachments are deleted. Null = never. */
  retentionClosedFilesDays: integer("retention_closed_files_days"),
  /** Months before inactive placeholder contacts (imported / insight, never signed in) are anonymised. Null = never. */
  retentionContactsMonths: integer("retention_contacts_months"),
  /** Last run of the nightly retention job for this project. */
  retentionRunAt: timestamp("retention_run_at", { withTimezone: true }),
  /** Machine translation of user content: off, on demand (button), or automatic for visitors in another language. */
  translationMode: text("translation_mode").notNull().default("off"),
  createdAt: createdAt(),
}, (t) => [
  index("projects_github_installation").on(t.githubInstallationId),
  check("projects_retention_capture", sql`${t.retentionCaptureDays} is null or ${t.retentionCaptureDays} in (30, 90, 180, 365)`),
  check("projects_retention_closed_files", sql`${t.retentionClosedFilesDays} is null or ${t.retentionClosedFilesDays} in (30, 90, 180, 365)`),
  check("projects_translation_mode", sql`${t.translationMode} in ('off','on_demand','auto')`),
  check("projects_retention_contacts", sql`${t.retentionContactsMonths} is null or ${t.retentionContactsMonths} in (6, 12, 24)`),
  check("projects_unanswered_days", sql`${t.unansweredDays} between 1 and 90`),
  check("projects_vote_mode", sql`${t.voteMode} in ('simple', 'importance')`),
  check("projects_vote_budget", sql`${t.voteBudget} is null or ${t.voteBudget} between 1 and 100`),
  index("projects_workspace").on(t.workspaceId),
  uniqueIndex("projects_custom_domain_verified").on(t.customDomain).where(sql`${t.customDomainVerifiedAt} is not null`),
]);

export const users = pgTable("users", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  /** Id in the host app (SSO/OIDC) or our own account id (magic link). */
  externalId: text("external_id").notNull(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  traits: jsonb("traits").notNull().default({}),
  role: userRole("role").notNull().default("member"),
  emailOptOut: boolean("email_opt_out").notNull().default(false),
  /** Bumped to sign the user out everywhere; sessions carry the version they were issued with. */
  sessionVersion: integer("session_version").notNull().default(0),
  /** Last language the user acted in (sk|cs|en|pl|hu|de); e-mails go out in it. Null → project default. */
  locale: text("locale"),
  /** Blocked by the team on this board: may read, but not post, comment, vote or edit. */
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  /** Last sign-in (SSO, OIDC, e-mail code, console hand-off). Null = never signed in (imported/insight placeholders). */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_project_external").on(t.projectId, t.externalId)]);

export const items = pgTable("items", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: itemKind("kind").notNull(),
  /** Human number per project: BUG-12, #34. */
  number: integer("number").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: itemStatus("status").notNull(),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  /** Bugs: url, appVersion, browser, console, network, replay links. Masked on the client before upload. */
  context: jsonb("context"),
  fixedInVersion: text("fixed_in_version"),
  voteCount: integer("vote_count").notNull().default(0),
  mergedIntoId: uuid("merged_into_id"),
  /** Optional finer status inside the current stage (custom_statuses); cleared when the stage moves elsewhere. */
  subStatusId: uuid("sub_status_id").references(() => customStatuses.id, { onDelete: "set null" }),
  /**
   * Waiting for the team (moderation queue): visible only to the author and the team, never in
   * lists for others, MCP, widget, webhooks or e-mails to non-team. `pendingReason`: "approval"
   * (project moderates new ideas) or "links" (looked like spam).
   */
  pending: boolean("pending").notNull().default(false),
  pendingReason: text("pending_reason"),
  /** Last change of title/body by a person (shown as "edited"). */
  editedAt: timestamp("edited_at", { withTimezone: true }),
  /** Soft delete (also "rejected" from the queue, with a reason shown to the author). */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedById: uuid("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
  deleteReason: text("delete_reason"),
  /** Where the post came from (provenance for agents): board, widget, mcp, import, api. */
  source: text("source").notNull().default("board"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("items_source", sql`${t.source} in ('board', 'widget', 'mcp', 'import', 'api')`),
  uniqueIndex("items_project_number").on(t.projectId, t.number),
  index("items_board").on(t.projectId, t.kind, t.status, t.voteCount),
  check("items_title_len", sql`char_length(${t.title}) between 1 and 200`),
]);

/**
 * Custom sub-statuses: finer tracking inside a fixed stage (e.g. "V testovaní" under in_progress).
 * Each maps onto one stage of its kind, so the route, e-mails, roadmap and GitHub keep working on stages.
 * `labels`: { sk: "…", en: "…" } for the board's enabled locales (fallback to the default locale).
 */
export const customStatuses = pgTable("custom_statuses", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: itemKind("kind").notNull(),
  stage: itemStatus("stage").notNull(),
  labels: jsonb("labels").notNull().default({}),
  position: smallint("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("custom_statuses_project").on(t.projectId, t.kind, t.stage, t.position)]);

/** Tag colours are theme tokens (never hex), so tags wear the host palette in light and dark. */
export const TAG_COLORS = ["neutral", "accent", "amber", "green", "red", "muted"] as const;

/** Per-project tags. Public tags show on the board and filter for everyone; team tags only for the team. */
export const tags = pgTable("tags", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("neutral"),
  public: boolean("public").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("tags_project_name").on(t.projectId, sql`lower(${t.name})`),
  check("tags_name_len", sql`char_length(${t.name}) between 1 and 40`),
  check("tags_color", sql`${t.color} in ('neutral', 'accent', 'amber', 'green', 'red', 'muted')`),
]);

export const itemTags = pgTable("item_tags", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.itemId, t.tagId] }), index("item_tags_tag").on(t.tagId)]);

/**
 * Status history: one row per status change (the "route" a report travels on the board).
 * Creation is items.created_at; this table holds every stop after that.
 */
export const itemEvents = pgTable("item_events", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  fromStatus: itemStatus("from_status"),
  toStatus: itemStatus("to_status").notNull(),
  version: text("version"),
  /** Sub-status reached with this stop (custom_statuses), if any. */
  subStatusId: uuid("sub_status_id").references(() => customStatuses.id, { onDelete: "set null" }),
  /** Board user who changed it; null for automation (GitHub, MCP without a user, changelog). */
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  /**
   * Proof of the fix/ship, snapshotted when the item reached fixed/shipped: merged PRs, the release and
   * an optional preview/demo URL (shape: ProofSnapshot in apps/web/src/lib/proof.ts).
   */
  proof: jsonb("proof"),
  createdAt: createdAt(),
}, (t) => [index("item_events_item").on(t.itemId, t.createdAt)]);

/**
 * Evidence attached to an item before (or while) it is fixed: merged PRs (GitHub webhook, MCP, team) and
 * preview/demo URLs. Copied into item_events.proof when the item reaches fixed/shipped.
 */
/** Cached machine translations of user content (per source version and target language). */
export const contentTranslations = pgTable("content_translations", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  /** What was translated: an item (title+body), a comment, or a changelog entry (title+body). */
  subject: text("subject").notNull(),
  subjectId: uuid("subject_id").notNull(),
  /** sha256 (hex) of the source text that was translated: an edit changes the version and misses the cache. */
  sourceHash: text("source_hash").notNull(),
  targetLocale: text("target_locale").notNull(),
  /** Detected language of the source, null if unsure. */
  sourceLocale: text("source_locale"),
  title: text("title"),
  body: text("body").notNull().default(""),
  /** Model that translated it (AI Act art. 50 labelling). */
  model: text("model").notNull(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.subjectId, t.sourceHash, t.targetLocale] }),
  index("content_translations_project").on(t.projectId, t.createdAt),
  check("content_translations_subject", sql`${t.subject} in ('item', 'comment', 'changelog')`),
]);

export const itemProofs = pgTable("item_proofs", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  /** "pr" | "preview" */
  kind: text("kind").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  /** "owner/repo#45" for PRs. */
  ref: text("ref"),
  /** Who attached it; null = GitHub webhook. */
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("item_proofs_url").on(t.itemId, t.kind, t.url), check("item_proofs_kind", sql`${t.kind} in ('pr', 'preview')`)]);

export const votes = pgTable("votes", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** 1 = upvote; 1–3 when the project uses importance voting. */
  weight: smallint("weight").notNull().default(1),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.itemId, t.userId] }), check("votes_weight", sql`${t.weight} between 1 and 3`)]);

export const comments = pgTable("comments", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  /** Team-only note, never shown to the reporter or public. */
  internal: boolean("internal").notNull().default(false),
  /** Waiting for team approval (comment moderation queue): visible only to its author and the team. */
  pending: boolean("pending").notNull().default(false),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  /** Soft delete: the thread keeps a quiet placeholder; the body is never sent to anybody again. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedById: uuid("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
  /** Where the comment came from (provenance for agents): board, widget, mcp, import, api. */
  source: text("source").notNull().default("board"),
  createdAt: createdAt(),
}, (t) => [
  index("comments_item").on(t.itemId, t.createdAt),
  check("comments_source", sql`${t.source} in ('board', 'widget', 'mcp', 'import', 'api')`),
]);

export const attachments = pgTable("attachments", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  /** Key in the S3-compatible store (or disk path in self-host). */
  storageKey: text("storage_key").notNull().unique(),
  name: text("name").notNull().default("subor"),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  createdAt: createdAt(),
});

export const emailStatus = pgEnum("email_status", ["queued", "sent", "deferred", "digested", "failed", "skipped"]);

/**
 * Outbox + log + quota counter in one table (ADR-0007). The worker claims rows with
 * FOR UPDATE SKIP LOCKED; over the monthly plan limit rows become "deferred" and go out in a daily digest.
 */
export const emails = pgTable("emails", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  to: text("to").notNull(),
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  /** Short plain-text line used for the digest when deferred. */
  summary: text("summary").notNull(),
  html: text("html").notNull(),
  text: text("text").notNull(),
  status: emailStatus("status").notNull().default("queued"),
  attempts: smallint("attempts").notNull().default(0),
  lastError: text("last_error"),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("emails_queue").on(t.status, t.sendAfter),
  index("emails_quota").on(t.projectId, t.sentAt),
]);

/**
 * Personal access tokens for MCP and the REST API. Only the SHA-256 hash is stored; the token
 * itself (ozvi_pat_…) is shown once. Effective rights = min(token scope, the owner's current role).
 */
export const tokenScope = pgEnum("token_scope", ["read", "write", "triage"]);

export const apiTokens = pgTable("api_tokens", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  hash: text("hash").notNull().unique(),
  /** First characters of the token, for recognising it in the list. */
  prefix: text("prefix").notNull(),
  scope: tokenScope("scope").notNull().default("read"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  /** Set for tokens issued through OAuth (MCP connectors); refresh token stored as hash. */
  oauthClientId: uuid("oauth_client_id"),
  refreshHash: text("refresh_hash").unique(),
  /** One OAuth grant: every token rotated from the same authorization code shares it (reuse revokes them all). */
  oauthFamily: uuid("oauth_family"),
  /** When this token's refresh token was rotated; presenting it again afterwards is reuse (RFC 9700 §4.14.2). */
  refreshUsedAt: timestamp("refresh_used_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("api_tokens_project").on(t.projectId), index("api_tokens_oauth_family").on(t.oauthFamily)]);

/** slack: { text } (also Mattermost, Rocket.Chat); teams: Adaptive Card (Workflows / incoming webhook); discord: embeds. */
export const webhookFormat = pgEnum("webhook_format", ["json", "slack", "teams", "discord"]);
export const deliveryStatus = pgEnum("delivery_status", ["queued", "sent", "failed"]);

/** Outgoing webhooks. JSON payloads are signed (Ozvi-Signature: t=…,v1=HMAC-SHA256). */
export const webhooks = pgTable("webhooks", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secretEnc: text("secret_enc").notNull(),
  format: webhookFormat("format").notNull().default("json"),
  /** Subscribed event names; empty = all. */
  events: text("events").array().notNull().default(sql`'{}'::text[]`),
  /** Private bug content is sent only when this is on. */
  includeBugs: boolean("include_bugs").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("webhooks_project").on(t.projectId)]);

/** Same outbox pattern as e-mails (ADR-0007): enqueued in the causing transaction, sent by the worker. */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  webhookId: uuid("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  status: deliveryStatus("status").notNull().default("queued"),
  attempts: smallint("attempts").notNull().default(0),
  responseCode: smallint("response_code"),
  lastError: text("last_error"),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("webhook_deliveries_queue").on(t.status, t.sendAfter), index("webhook_deliveries_hook").on(t.webhookId, t.createdAt)]);

/** Third-party connections per project (github, linear, jira). Token and webhook secret AES-GCM encrypted. */
export const integrations = pgTable("integrations", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  /** GitHub: { repo: "owner/name" }; Linear/Jira: team/project, cached workflow states, state → stage mapping (lib/trackers). */
  config: jsonb("config").notNull().default({}),
  tokenEnc: text("token_enc"),
  webhookSecretEnc: text("webhook_secret_enc"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("integrations_project_provider").on(t.projectId, t.provider)]);

/** Item ↔ external issue (GitHub "owner/repo#123"). State mirrors the issue via webhooks. */
export const itemLinks = pgTable("item_links", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  ref: text("ref").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  state: text("state").notNull().default("open"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  /** Linear issue UUID / Jira issue id: webhooks identify issues by it (the readable ref can change). */
  externalId: text("external_id"),
  /**
   * Status sync bookkeeping (Linear/Jira): { stateId, stateName } last seen on the tracker and
   * { pushedStateId, pushedAt } last sent by Ozvi, so our own change echoing back is recognised (no ping-pong).
   */
  sync: jsonb("sync").notNull().default({}),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("item_links_ref").on(t.projectId, t.provider, t.ref), index("item_links_item").on(t.itemId),
  index("item_links_external").on(t.provider, t.externalId)]);

/**
 * Ozvi → work tracker outbox (Linear/Jira): status moves and mirrored comments, enqueued in the
 * transaction that caused them, sent by the job worker with retries (same pattern as webhook_deliveries).
 */
export const trackerSyncs = pgTable("tracker_syncs", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  linkId: uuid("link_id").notNull().references(() => itemLinks.id, { onDelete: "cascade" }),
  /** "status" | "comment" */
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  status: deliveryStatus("status").notNull().default("queued"),
  attempts: smallint("attempts").notNull().default(0),
  lastError: text("last_error"),
  sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("tracker_syncs_queue").on(t.status, t.sendAfter), check("tracker_syncs_kind", sql`${t.kind} in ('status', 'comment')`)]);

/**
 * Cloud accounts: people who own workspaces (sign in at /app with an e-mailed code).
 * Not tenant data — global like workspaces/projects, no RLS. Board users stay per project (users).
 */
export const accounts = pgTable("accounts", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  /** Bumped to sign the account out everywhere. */
  sessionVersion: integer("session_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("owner"),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.accountId] }), index("workspace_members_account").on(t.accountId)]);

/** Invitations to a workspace, by e-mail. The link (hash only) is the proof of the address; single use, 7 days. */
export const workspaceInvites = pgTable("workspace_invites", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  /** "owner" (billing, people) or "member" (projects only). */
  role: text("role").notNull().default("member"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => accounts.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("workspace_invites_ws").on(t.workspaceId)]);

/**
 * One-time e-mail sign-in: a 6-digit code and a magic link token, both stored as hashes.
 * projectId null = account sign-in at /app; otherwise sign-in to that project's board.
 */
/**
 * Who changed what in a workspace (console and board settings): invites, roles, plan, projects,
 * domains, tokens, webhooks, integrations. Workspace-scoped like workspace_members (no RLS);
 * read only through the console after a membership check. `actor` is a display label, kept
 * even after the person leaves.
 */
export const activity = pgTable("activity", {
  id: id(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  actor: text("actor"),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: createdAt(),
}, (t) => [index("activity_workspace").on(t.workspaceId, t.createdAt)]);

export const loginCodes = pgTable("login_codes", {
  id: id(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  /** "login" = e-mailed code/link; "handoff" = /app → project admin (never e-mailed); "email" = confirm a new account address. */
  purpose: text("purpose").notNull().default("login"),
  /** purpose "email": the account whose address changes to `email` once the link is opened. */
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  linkHash: text("link_hash").notNull().unique(),
  returnTo: text("return_to"),
  attempts: smallint("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("login_codes_email").on(t.email, t.createdAt)]);

/** OAuth 2.1 for MCP connectors: dynamically registered clients, per project (each board is its own issuer). */
export const oauthClients = pgTable("oauth_clients", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  /** DCR (legacy): random `ozvi_client_…`; CIMD: the https URL of the client's metadata document. */
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  createdAt: createdAt(),
}, (t) => [index("oauth_clients_project").on(t.projectId), uniqueIndex("oauth_clients_project_client").on(t.projectId, t.clientId)]);

export const oauthCodes = pgTable("oauth_codes", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull().unique(),
  clientId: uuid("client_id").notNull().references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: tokenScope("scope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Changelog: what shipped, in the team's words. Publishing marks linked ideas as shipped and
 * e-mails everyone who voted for them once, with the whole entry.
 */
export const changelogEntries = pgTable("changelog_entries", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  /** null = draft (team only). */
  publishedAt: timestamp("published_at", { withTimezone: true }),
  /** Drafted automatically from a GitHub release (tag without the leading "v", and the release page). */
  releaseTag: text("release_tag"),
  releaseUrl: text("release_url"),
  /** The text was written with AI (model id); null = written by people only. EU AI Act art. 50 labelling. */
  aiModel: text("ai_model"),
  /** An AI rewrite of the release draft is running; the team sees the template meanwhile. */
  aiPending: boolean("ai_pending").notNull().default(false),
  /** The person who approved (published) it — shown as "skontroloval/a" next to the AI label. */
  reviewedById: uuid("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("changelog_project").on(t.projectId, t.publishedAt), check("changelog_title_len", sql`char_length(${t.title}) between 1 and 200`),
  uniqueIndex("changelog_release").on(t.projectId, t.releaseTag)]);

export const changelogItems = pgTable("changelog_items", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  entryId: uuid("entry_id").notNull().references(() => changelogEntries.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.entryId, t.itemId] }), index("changelog_items_item").on(t.itemId)]);

/**
 * Imports (Fider, CSV, …) as a background job with progress. Undo deletes what the run created
 * (tracked in import_records).
 */
export const importRuns = pgTable("import_runs", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  status: text("status").notNull().default("queued"),
  label: text("label"),
  input: jsonb("input"),
  total: integer("total").notNull().default(0),
  done: integer("done").notNull().default(0),
  report: jsonb("report").notNull().default({}),
  error: text("error"),
  createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
}, (t) => [index("import_runs_project").on(t.projectId, t.createdAt)]);

/** What an import run created, keyed by source ids so a re-run is idempotent. */
export const importRecords = pgTable("import_records", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  runId: uuid("run_id").notNull().references(() => importRuns.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  targetId: text("target_id").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("import_records_source").on(t.projectId, t.source, t.sourceType, t.sourceId), index("import_records_run").on(t.runId)]);
