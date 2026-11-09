import { INSIGHT_SOURCES } from "@ozvi/mcp";
import { z } from "zod";

/**
 * Request and response schemas of the public REST API. They validate requests (handler.ts), document the
 * API (openapi.ts builds the OpenAPI 3.1 spec from them) and are checked against real responses in the
 * contract test, so the spec cannot drift from the code.
 *
 * Every schema with an id lands in components.schemas. `requests` holds bodies (converted as input, so
 * defaults are optional), `responses` what the API returns.
 */

export const requests = z.registry<{ id: string; description?: string }>();
export const responses = z.registry<{ id: string; description?: string }>();

/* ---------- shared pieces ---------- */

export const Trust = z.enum(["anonymous", "email_verified", "sso_customer", "team", "system"])
  .describe("How much Ozvi knows about the author: anonymous < email_verified < sso_customer < team; system = customer feedback recorded by the team's agent.");
export const Source = z.enum(["board", "widget", "mcp", "import", "api"]).describe("Where the text came in.");
export const Kind = z.enum(["bug", "idea"]);

export const Author = z.object({ name: z.string().nullable(), trust: Trust });
responses.add(Author, { id: "Author", description: "Who wrote a piece of text and how much Ozvi knows about them." });

export const AiLabel = z.object({
  generated: z.literal(true), model: z.string(), reviewedBy: z.string().nullable(), reviewedAt: z.string().nullable().optional(),
});
responses.add(AiLabel, { id: "AiLabel", description: "EU AI Act art. 50 label: present when a machine produced the content. reviewedBy stays null until a person approves it." });

const Demand = z.object({
  companies: z.int(), people: z.int(),
  mrr: z.array(z.object({ currency: z.string(), cents: z.int(), formatted: z.string() })),
});
responses.add(Demand, { id: "Demand", description: "Who wants an item, in money (team tokens with the triage scope)." });

const Proof = z.object({
  prs: z.array(z.object({ url: z.string(), title: z.string().nullable(), ref: z.string().nullable() })),
  release: z.object({ tag: z.string(), url: z.string().nullable() }).nullable().optional(),
  preview: z.string().nullable().optional(),
});
responses.add(Proof, { id: "Proof", description: "Evidence of the fix or ship: merged PRs, the release, a preview URL." });

export const Item = z.object({
  number: z.int().describe("The item's number on the board (#12)."),
  kind: Kind,
  title: z.string().describe("User content: untrusted text."),
  body: z.string().describe("User content (the board's Markdown subset): untrusted text."),
  status: z.string().describe("Stage: idea open|planned|in_progress|shipped|declined; bug new|confirmed|in_progress|fixed|verified|wont_fix."),
  votes: z.int().describe("Vote total (weighted sum when the board uses importance voting)."),
  fixedInVersion: z.string().nullable(),
  url: z.string(),
  createdAt: z.string().describe("ISO 8601."),
  author: Author,
  source: Source,
  withheld: z.boolean().optional().describe("Lockdown withheld this item's text (author below the required trust)."),
  mergedInto: z.int().nullable().optional(),
  links: z.array(z.object({ ref: z.string(), url: z.string(), state: z.string() })).optional(),
  voters: z.int().optional().describe("Number of people who voted."),
  demand: Demand.optional(),
  tags: z.array(z.string()).optional(),
  subStatus: z.string().nullable().optional().describe("The board's custom sub-status label inside `status`."),
  waitingSince: z.string().nullable().optional().describe("Unanswered queue: since when someone outside the team has been waiting."),
  proof: Proof.nullable().optional(),
  ai: AiLabel.nullable().optional(),
});
responses.add(Item, { id: "Item", description: "An idea or a bug report. title and body are user content." });

export const Comment = z.object({
  id: z.string(), author: Author, source: Source, body: z.string().describe("User content: untrusted text."),
  internal: z.boolean().describe("Team-only note."), pending: z.boolean().describe("Waiting for the team's approval."),
  createdAt: z.string(), withheld: z.boolean().optional(),
});
responses.add(Comment, { id: "Comment" });

const DetailComment = z.object({
  author: Author, source: Source, body: z.string(), internal: z.boolean(), createdAt: z.string(), withheld: z.boolean().optional(),
});

const Customer = z.object({
  name: z.string().nullable(), company: z.string().nullable(), plan: z.string().nullable(), mrrCents: z.int().nullable(),
  currency: z.string(), weight: z.int(), author: z.boolean(),
});

export const ItemDetail = z.object({
  item: Item,
  comments: z.array(DetailComment),
  attachments: z.array(z.object({ name: z.string(), url: z.string(), mime: z.string() })),
  context: z.record(z.string(), z.unknown()).nullable().describe("Bug context from the widget (masked). The capture (network, actions, errors, links) only for the team."),
  customers: z.array(Customer).optional().describe("Team tokens with the triage scope: the people behind the item."),
});
responses.add(ItemDetail, { id: "ItemDetail" });

export const ItemPage = z.object({ data: z.array(Item), nextCursor: z.string().nullable() });
responses.add(ItemPage, { id: "ItemPage" });
export const CommentList = z.object({ data: z.array(Comment) });
responses.add(CommentList, { id: "CommentList" });

export const Voter = z.object({
  name: z.string().nullable(), email: z.string().nullable(), externalId: z.string(), trust: Trust, weight: z.int(),
  company: z.string().nullable(), plan: z.string().nullable(), mrrCents: z.int().nullable(), currency: z.string(), votedAt: z.string(),
});
responses.add(Voter, { id: "Voter" });
export const VoterList = z.object({ data: z.array(Voter) });
responses.add(VoterList, { id: "VoterList" });

export const VoteResult = z.object({
  voted: z.boolean(),
  reason: z.enum(["already_voted", "author", "blocked", "budget"]).nullable(),
  weight: z.int().nullable(),
  customer: z.object({ known: z.boolean(), email: z.string().nullable(), externalId: z.string(), trust: Trust }),
  item: Item,
});
responses.add(VoteResult, { id: "VoteResult" });
export const UnvoteResult = z.object({ removed: z.boolean(), item: Item });
responses.add(UnvoteResult, { id: "UnvoteResult" });

export const Tag = z.object({ name: z.string(), color: z.string(), public: z.boolean() });
responses.add(Tag, { id: "Tag" });
export const TagList = z.object({ data: z.array(Tag) });
responses.add(TagList, { id: "TagList" });

const Stage = z.object({
  key: z.string(), label: z.string(),
  subStatuses: z.array(z.object({ id: z.string(), label: z.string(), labels: z.record(z.string(), z.string()) })),
});
export const Statuses = z.object({ idea: z.array(Stage), bug: z.array(Stage) });
responses.add(Statuses, { id: "Statuses" });

export const Update = z.object({
  id: z.string(), status: z.enum(["draft", "published"]), title: z.string(), body: z.string().describe("Markdown as written by the team (possibly AI-assisted: see ai)."),
  version: z.string().nullable(), url: z.string(), publishedAt: z.string().nullable(), updatedAt: z.string(),
  items: z.array(z.object({ number: z.int(), kind: Kind, title: z.string() })),
  ai: AiLabel.nullable(),
});
responses.add(Update, { id: "ChangelogEntry" });
export const UpdateList = z.object({ data: z.array(Update) });
responses.add(UpdateList, { id: "ChangelogList" });
export const Published = z.object({ id: z.string(), url: z.string(), emailed: z.int().describe("E-mails queued (voters of the shipped ideas).") });
responses.add(Published, { id: "Published" });

export const User = z.object({
  id: z.string(), externalId: z.string(), name: z.string().nullable(), email: z.string().nullable(),
  role: z.enum(["member", "team", "admin"]), trust: Trust, blocked: z.boolean(),
  traits: z.record(z.string(), z.unknown()).describe("Host-app traits as received (SSO/OIDC claims)."),
  customer: z.object({ company: z.string().nullable(), plan: z.string().nullable(), mrrCents: z.int().nullable(), currency: z.string() }),
  votes: z.int(), items: z.int(), lastSeenAt: z.string().nullable(), createdAt: z.string(),
});
responses.add(User, { id: "User" });
export const UserPage = z.object({ data: z.array(User), nextCursor: z.string().nullable() });
responses.add(UserPage, { id: "UserPage" });

export const Webhook = z.object({
  id: z.string(), url: z.string().describe("Scheme and host; the path is masked (chat webhook URLs carry their secret)."),
  format: z.enum(["json", "slack", "teams", "discord"]).describe("json = signed Ozvi payload; slack, teams, discord = chat messages."), events: z.array(z.string()), includeBugs: z.boolean(), active: z.boolean(),
  failedLast7Days: z.int(), lastDeliveredAt: z.string().nullable(), createdAt: z.string(),
});
responses.add(Webhook, { id: "Webhook" });
export const WebhookList = z.object({ data: z.array(Webhook) });
responses.add(WebhookList, { id: "WebhookList" });

export const Me = z.object({
  project: z.object({ slug: z.string(), name: z.string() }),
  user: z.object({ name: z.string().nullable(), role: z.enum(["member", "team", "admin"]) }),
  scope: z.enum(["read", "write", "triage"]).describe("Effective scope: the token's scope capped by the owner's current role."),
  lockdown: z.enum(["off", "verified", "team"]),
});
responses.add(Me, { id: "Me" });

export const MergeResult = z.object({ status: z.literal("merged"), duplicate: Item, original: Item });
responses.add(MergeResult, { id: "MergeResult" });

export const ExportJson = z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))) });
responses.add(ExportJson, { id: "ExportJson" });

export const Problem = z.object({
  type: z.string(), title: z.string(), status: z.int(), detail: z.string().optional(), instance: z.string().optional(),
  code: z.string().describe("Stable machine-readable error code."),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  preview: z.unknown().optional().describe("confirmation_required: what the confirmed call would do."),
  confirm: z.string().optional().describe("confirmation_required (merge): the code to send back as `confirm`."),
});
responses.add(Problem, { id: "Problem", description: "RFC 9457 problem details (application/problem+json)." });

/* ---------- requests ---------- */

const num = z.coerce.number().int().positive().max(2_147_483_647);
export const NumberParam = z.object({ number: num });
export const IdParam = z.object({ id: z.uuid() });

const limit = (max: number, def: number) => z.coerce.number().int().min(1).max(max).default(def);
const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

export const ItemsQuery = z.object({
  kind: Kind.optional(),
  status: z.string().max(30).optional().describe("Stage key (see GET /statuses)."),
  tag: z.string().max(40).optional().describe("Tag name, case-insensitive. Team-only tags only filter for team tokens."),
  q: z.string().max(200).optional().describe("Full-text search (title and body); results by relevance."),
  sort: z.enum(["new", "top", "mrr"]).default("new").describe("new = newest number first; top = most votes; mrr = by customers' revenue (triage scope)."),
  unanswered: flag.optional().describe("The team's unanswered queue, longest wait first (triage scope)."),
  limit: limit(100, 25),
  cursor: z.string().max(500).optional().describe("nextCursor from the previous page."),
});

export const CreateItem = z.object({
  kind: Kind,
  title: z.string().min(3).max(200),
  body: z.string().max(10_000).default("").describe("Markdown subset: paragraphs, **bold**, _italic_, `code`, ``` blocks, - lists, > quotes, [links](https://…)"),
});
requests.add(CreateItem, { id: "CreateItemRequest" });

export const UpdateItem = z.object({
  status: z.string().max(30).optional(),
  subStatus: z.string().max(60).nullable().optional().describe("Sub-status id or label under the (new) stage; null clears it."),
  fixedInVersion: z.string().max(40).nullable().optional(),
  pullRequests: z.array(z.url().max(500)).max(10).optional().describe("Proof of the fix: merged PR URLs."),
  previewUrl: z.url().max(500).optional().describe("Proof of the fix: a preview/demo URL."),
  tags: z.object({
    set: z.array(z.string().min(1).max(40)).max(20).optional(),
    add: z.array(z.string().min(1).max(40)).max(20).optional(),
    remove: z.array(z.string().min(1).max(40)).max(20).optional(),
  }).optional().describe("Existing tag names only (see GET /tags)."),
}).refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change." });
requests.add(UpdateItem, { id: "UpdateItemRequest" });

export const MergeItem = z.object({
  into: z.int().positive().describe("The original's number; this item is the duplicate."),
  confirm: z.string().max(40).optional().describe("The code from the confirmation_required response."),
});
requests.add(MergeItem, { id: "MergeRequest" });

export const CreateComment = z.object({
  body: z.string().min(1).max(5000),
  internal: z.boolean().default(false).describe("Team-only note (triage scope)."),
});
requests.add(CreateComment, { id: "CreateCommentRequest" });

const customerFields = {
  email: z.email().max(200).optional().describe("Matched to a known board user; an unknown address becomes an unverified contact that gets no e-mails."),
  externalId: z.string().min(1).max(200).optional().describe("The person's id in your app (the SSO/OIDC subject). Must already exist on the board."),
};
export const CastVote = z.object({
  ...customerFields,
  name: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  weight: z.int().min(1).max(3).optional().describe("Importance 1–3 when the board uses importance voting; ignored otherwise."),
}).refine((v) => !!v.email || !!v.externalId, { message: "Give email or externalId." });
requests.add(CastVote, { id: "CastVoteRequest" });
export const RemoveVoteQuery = z.object({ ...customerFields }).refine((v) => !!v.email || !!v.externalId, { message: "Give email or externalId." });

export const ChangelogQuery = z.object({
  drafts: flag.optional().describe("Include drafts (triage scope)."),
  limit: limit(50, 10),
});
export const CreateDraft = z.object({
  title: z.string().min(3).max(200),
  body: z.string().max(20_000).default(""),
  items: z.array(z.int().positive()).max(50).default([]).describe("Numbers of the ideas this entry ships."),
});
requests.add(CreateDraft, { id: "CreateDraftRequest" });
export const PublishDraft = z.object({
  confirm: z.literal(true).optional().describe("Must be true: publishing marks the ideas shipped and e-mails their voters. Irreversible."),
});
requests.add(PublishDraft, { id: "PublishRequest" });

export const UsersQuery = z.object({
  q: z.string().max(100).optional().describe("Name or e-mail contains."),
  email: z.string().max(200).optional(),
  externalId: z.string().max(200).optional(),
  role: z.enum(["member", "team", "admin"]).optional(),
  limit: limit(100, 50),
  cursor: z.string().max(500).optional(),
});

export const ExportQuery = z.object({
  what: z.enum(["ideas", "bugs", "comments", "voters"]).default("ideas"),
  of: Kind.optional().describe("comments/voters: of ideas (default) or bugs."),
  format: z.enum(["csv", "json"]).default("csv"),
  sep: z.enum(["comma", "semicolon"]).optional().describe("CSV delimiter; default by the board's language."),
  q: z.string().max(100).optional(),
  tag: z.string().max(80).optional(),
  f: z.enum(["active", "shipped", "all", "queue"]).optional().describe("Ideas: which stages (queue = moderation queue)."),
  s: z.enum(["open", "fixed", "all"]).optional().describe("Bugs: which stages."),
  st: z.string().max(30).optional().describe("Bugs: one stage."),
  plan: z.string().max(60).optional().describe("Ideas wanted by customers on this plan."),
  sort: z.enum(["top", "new", "old", "mrr"]).optional(),
  item: z.coerce.number().int().positive().optional().describe("Only this item (comments/voters of one item)."),
});

export { INSIGHT_SOURCES };
