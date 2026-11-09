import "server-only";
import type { PlanName, Tx } from "@ozvi/db";
import type { ForeignPost } from "@/components/ozvi/Translate";
import { renderMarkdown } from "./markdown";
import type { ShownTranslation } from "./translate-actions";
import { cachedTranslations, foreignPosts, translationEnabled, translationModeOf, type Source } from "./translate";

export interface TranslationView { mode: "on_demand" | "auto"; foreign: ForeignPost[]; initial: ShownTranslation[] }

/**
 * What a board page needs for post translation: which of the posts it shows (already filtered to what
 * the viewer may read) are in another language, and their cached translations. Never calls the model;
 * null when the board has translation off or no AI.
 */
export async function translationView(tx: Tx, ctx: {
  project: { translationMode?: string | null }; plan: PlanName; locale: string; slug: string; origin: string;
}, posts: Source[]): Promise<TranslationView | null> {
  if (!translationEnabled(ctx.project, ctx.plan)) return null;
  const foreign = foreignPosts(posts.filter((p) => p.body || p.title), ctx.locale);
  const cached = await cachedTranslations(tx, foreign, ctx.locale);
  return {
    mode: translationModeOf(ctx.project) === "auto" ? "auto" : "on_demand",
    foreign: foreign.map((p) => ({ subject: p.subject, id: p.id })),
    initial: [...cached.values()].map((x) => ({
      id: x.id, title: x.title, model: x.model,
      html: renderMarkdown(x.body, { slug: ctx.slug, origin: ctx.origin, headings: x.subject === "changelog" }),
    })),
  };
}
