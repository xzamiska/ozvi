"use server";

import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "./db";
import { DomainError, isTeamRole } from "./domain";
import { getCtx } from "./project";
import { attachProof, prRef, removeProof } from "./proof";
import { allow } from "./ratelimit";

/** Team: attach proof of a fix (a PR or a preview/demo URL) to an item, or remove it. */

export interface ProofState { ok?: string; error?: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function requireTeam(slug: string) {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "forms.proof" });
  if (!ctx.user || !isTeamRole(ctx.user.role)) throw new Error(t("teamOnly"));
  return { ...ctx, user: ctx.user, t };
}

export async function addProof(slug: string, itemId: string, _: ProofState, form: FormData): Promise<ProofState> {
  const { project, user, t, locale } = await requireTeam(slug);
  if (!UUID.test(itemId)) return { error: t("noItem") };
  if (!allow("edit", user.id)) return { error: t("rate") };
  const url = String(form.get("url") ?? "").trim();
  const title = String(form.get("title") ?? "").trim().slice(0, 300) || null;
  try {
    await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(schema.items.id, itemId) });
      if (!item) throw new DomainError(t("noItem"));
      // A GitHub pull request URL is a PR; anything else is a preview/demo to try.
      await attachProof(tx, project.id, item.id, { kind: prRef(url) ? "pr" : "preview", url, title }, user.id);
    });
  } catch (e) {
    if (e instanceof DomainError) return { error: e.text(locale) };
    throw e;
  }
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("added") };
}

export async function deleteProof(slug: string, itemId: string, proofId: string) {
  const { project } = await requireTeam(slug);
  if (!UUID.test(itemId) || !UUID.test(proofId)) return;
  await withProject(db, project.id, (tx) => removeProof(tx, itemId, proofId));
  revalidatePath(`/${slug}`, "layout");
}
