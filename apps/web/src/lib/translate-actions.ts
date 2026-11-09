"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { AiError } from "./ai";
import { clientIp } from "./client-ip";
import { db } from "./db";
import { projectOrigin } from "./email/url";
import { renderMarkdown } from "./markdown";
import { getCtx } from "./project";
import { translateFor, type Subject, type TranslateError } from "./translate";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SUBJECTS = new Set<Subject>(["item", "comment", "changelog"]);

export interface ShownTranslation { id: string; title: string | null; html: string; model: string }
export interface TranslateResponse { translations: ShownTranslation[]; errors: Record<string, string>; error?: string }

/**
 * Translate posts on a board into the viewer's board language. Everything is checked again on the
 * server (lib/translate.ts): the viewer must be able to read each post, the board must have
 * translation on, AI must be available. Only the text of posts the viewer can read reaches the AI provider.
 */
export async function translatePostsAction(slug: string, wanted: { subject: string; id: string }[]): Promise<TranslateResponse> {
  const { project, user, isTeam, plan, locale } = await getCtx(slug);
  const t = await getTranslations({ locale, namespace: "translate" });
  const message = (code: TranslateError) => t(`errors.${code}`);
  const clean = (Array.isArray(wanted) ? wanted : [])
    .filter((w): w is { subject: Subject; id: string } => !!w && SUBJECTS.has(w.subject as Subject) && typeof w.id === "string" && UUID.test(w.id));
  if (clean.length === 0) return { translations: [], errors: {} };
  try {
    const res = await translateFor(db, {
      project, plan, target: locale, viewer: { userId: user?.id ?? null, isTeam },
      rateKey: user?.id ?? clientIp(await headers()), wanted: clean,
    });
    const origin = projectOrigin(project);
    return {
      translations: res.translations.map((x) => ({
        id: x.id, title: x.title, model: x.model,
        html: renderMarkdown(x.body, { slug, origin, headings: x.subject === "changelog" }),
      })),
      errors: Object.fromEntries(res.errors.map((e) => [e.id, message(e.code)])),
    };
  } catch (e) {
    if (e instanceof AiError) return { translations: [], errors: {}, error: message(e.code) };
    throw e;
  }
}
