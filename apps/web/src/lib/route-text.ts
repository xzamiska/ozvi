import { boardLocales, type BoardLanguages } from "@/i18n/board";
import type { Locale } from "@/i18n/locales";
import { translator } from "@/i18n/messages";
import { routeText } from "./route";
import { parseStatusLabels, stageOverride } from "./statuses";

/** A board whose renamed stops (projects.status_labels) should win over the built-in words. */
export type LabelSource = BoardLanguages & { statusLabels?: unknown };

/**
 * Stop texts in an explicit locale (e-mails, server pages). Pass the project so a renamed stop speaks
 * the board's word (inside a board request getTranslations("route") already does). Client components
 * use useTranslations("route") + routeText.
 */
export const stopLabel = (locale: Locale, status: string, board?: LabelSource) =>
  (board && stageOverride(parseStatusLabels(board.statusLabels), status, locale, boardLocales(board).fallback))
  || routeText(translator(locale, "route"), "label", status);
export const stopHint = (locale: Locale, status: string) => routeText(translator(locale, "route"), "hint", status);
