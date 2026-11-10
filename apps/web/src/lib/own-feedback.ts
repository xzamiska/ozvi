import "server-only";
import { schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { projectOrigin } from "./email/url";

/**
 * Ozvi's own feedback board (cloud): the project named by OZVI_FEEDBACK_PROJECT, e.g. "feedback"
 * → feedback.ozvi.io. The console shows its widget, signed in as the console account; the landing
 * links to it. Unset (and in self-host): nothing of this appears.
 */
export async function ownFeedback() {
  const slug = process.env.OZVI_MODE === "cloud" ? process.env.OZVI_FEEDBACK_PROJECT?.trim() : "";
  if (!slug) return null;
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.slug, slug)).limit(1);
  return p ? { project: p, ideas: `${projectOrigin(p)}/${p.slug}/ideas` } : null;
}
