import { schema } from "@ozvi/db";
import { sql } from "drizzle-orm";

const { emails } = schema;

/**
 * E-mails sent (counted against the plan's monthly quota): each sent row, plus one per digest, however many
 * notifications it carries (a digest's rows share user and sent_at). Use with status in (sent, digested).
 */
export const sentCount = sql<number>`(count(*) filter (where ${emails.status} = 'sent') + count(distinct (${emails.userId}, ${emails.sentAt})) filter (where ${emails.status} = 'digested'))::int`;
