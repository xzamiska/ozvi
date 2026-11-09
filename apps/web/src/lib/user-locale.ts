import "server-only";
import { schema, withProject } from "@ozvi/db";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { Locale } from "@/i18n/locales";
import { db } from "./db";

/**
 * Remember the language a user last acted in on the board (sign-in, posting, voting), so
 * notification e-mails reach them in it. Writes only when it changed.
 */
export async function rememberLocale(projectId: string, userId: string, locale: Locale): Promise<void> {
  await withProject(db, projectId, (tx) => tx.update(schema.users).set({ locale })
    .where(and(eq(schema.users.id, userId), or(isNull(schema.users.locale), ne(schema.users.locale, locale)))));
}
