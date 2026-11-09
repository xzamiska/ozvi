import { schema, withProject } from "@ozvi/db";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { discard, prepareAttachments, storeAttachments } from "./attachments";
import { db } from "./db";
import { notifyNewBug, notifyNewIdea } from "./email/notify";
import { emit } from "./events";
import type { Project, User } from "./project";
import { allow, RateLimitError } from "./ratelimit";
import { translator } from "@/i18n/messages";
import { assertCanParticipate } from "./domain";
import { DUPLICATE_ITEM_WINDOW_MS, pendingReason, sameTitle, type PendingReason } from "./moderation-rules";
import type { Locale } from "@/i18n/locales";
import { cleanCapture, type Capture } from "./bug-context";
import { maskText, maskUrl } from "@ozvi/sdk/mask";
import type { ItemSource } from "./provenance";

export class ValidationError extends Error {}

const CONTEXT_KEYS = ["url", "appVersion", "browser", "viewport", "language", "referrer", "console", "traits"] as const;

/**
 * Untrusted client context → known keys only, bounded strings; plus the widget's capture (network log,
 * steps, errors, session links), cleaned and masked again in bug-context.ts.
 */
export function cleanContext(raw: unknown): Record<string, string> & Capture {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    ...Object.fromEntries(
      CONTEXT_KEYS.filter((k) => typeof r[k] === "string" && r[k]).map((k) => [k, (k === "url" || k === "referrer" ? maskUrl : maskText)(String(r[k])).slice(0, k === "console" ? 4000 : 500)]),
    ),
    ...cleanCapture(r),
  } as Record<string, string> & Capture;
}

export interface NewItem {
  kind: "bug" | "idea"; title: string; body: string; context: unknown; files: File[];
  /** Provenance shown to agents (MCP, webhooks, GitHub); default "board". */
  source?: ItemSource;
}

/**
 * Shared by the board form (server action), the widget API and MCP. Returns the item number.
 * Blocked people get a DomainError; a repeated submit of the same title within a few minutes returns
 * the post created the first time; ideas from outside the team may wait in the moderation queue.
 */
export async function createItemFor(project: Project, user: User, input: NewItem, locale: Locale = "sk"): Promise<number> {
  return (await createItem(project, user, input, locale)).number;
}

/** Like createItemFor, plus why the post waits for the team (null = published), so the widget can say so. */
export async function createItem(project: Project, user: User, input: NewItem, locale: Locale = "sk"): Promise<{ number: number; pending: PendingReason | null }> {
  const t = translator(locale, "errors");
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 3) throw new ValidationError(t("titleShort"));
  if (title.length > 200) throw new ValidationError(t("titleLong"));
  if (body.length > 10_000) throw new ValidationError(t("bodyLong"));
  assertCanParticipate(user);
  const recent = await withProject(db, project.id, (tx) => tx.select({ number: schema.items.number, title: schema.items.title, pending: schema.items.pendingReason })
    .from(schema.items).where(and(eq(schema.items.authorId, user.id), eq(schema.items.kind, input.kind), isNull(schema.items.deletedAt),
      gte(schema.items.createdAt, new Date(Date.now() - DUPLICATE_ITEM_WINDOW_MS)))).orderBy(desc(schema.items.createdAt)).limit(10));
  const dup = recent.find((r) => sameTitle(r.title, title));
  if (dup) return { number: dup.number, pending: (dup.pending as PendingReason | null) ?? null };
  if (!allow("item", user.id) || !allow("itemBurst", user.id)) throw new RateLimitError(locale);
  const pending = pendingReason({ kind: input.kind, title, body }, user, project);
  const context = input.kind === "bug" ? cleanContext(input.context) : null;

  const files = await prepareAttachments(db, project, input.files, locale);
  const written: string[] = [];
  try {
    return await withProject(db, project.id, async (tx) => {
      const [seq] = await tx.update(schema.projects).set({ itemSeq: sql`${schema.projects.itemSeq} + 1` })
        .where(eq(schema.projects.id, project.id)).returning({ n: schema.projects.itemSeq });
      const [item] = await tx.insert(schema.items).values({
        projectId: project.id, kind: input.kind, number: seq!.n, title, body, context, authorId: user.id,
        status: input.kind === "bug" ? "new" : "open", pending: !!pending, pendingReason: pending, source: input.source ?? "board",
      }).returning();
      await storeAttachments(tx, project.id, item!.id, files, written);
      if (input.kind === "bug") await notifyNewBug(tx, project, item!);
      else await notifyNewIdea(tx, project, item!);
      await emit(tx, project, "item.created", { item: item!, actorName: user.name });
      return { number: seq!.n, pending };
    });
  } catch (e) {
    await discard(written);
    throw e;
  }
}
