"use server";

import { withProject } from "@ozvi/db";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { markInboxRead } from "./inbox";
import { getCtx } from "./project";

/** Team inbox "New" → "Mark as read". `at`: the time the page was rendered (newer news stays new). */
export async function markRead(slug: string, at: string) {
  const { project, user, isTeam } = await getCtx(slug);
  if (!user || !isTeam) return;
  const when = new Date(at);
  await withProject(db, project.id, (tx) => markInboxRead(tx, user.id, Number.isNaN(when.getTime()) || when > new Date() ? new Date() : when));
  revalidatePath(`/${slug}`, "layout");
}
