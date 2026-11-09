import { isLocale, LOCALES, type Locale } from "@/i18n/locales";
import { ROUTE, type Kind } from "./route";

/**
 * Custom statuses, kept deliberately thin: the fixed stage (items.status) stays the source of truth for
 * the route, e-mails, roadmap columns, filters and GitHub automation. A project may
 *  - rename a stage's label per locale (projects.status_labels: { [status]: { [locale]: label } }), and
 *  - add sub-statuses (custom_statuses) that each sit under one stage, for finer tracking.
 * Pure module: used by the request config (message overrides), server pages, e-mails and client components.
 */

export type Labels = Partial<Record<Locale, string>>;
export type StatusLabels = Partial<Record<string, Labels>>;

export interface SubStatus { id: string; kind: Kind; stage: string; labels: Labels; position: number }

export const LABEL_MAX = 40;
/** Sub-statuses per stage; a handful keeps the team's status control readable. */
export const SUBS_PER_STAGE = 6;

/** Every stage status across kinds, once ("in_progress" is shared, so its label is too). */
/** Off-route stage per kind (declined ideas, won't-fix bugs). */
const OFF: Record<Kind, string> = { idea: "declined", bug: "wont_fix" };

/** Stages in route order, then the off-route one (same set as ITEM_STATUSES in @ozvi/db, without importing it client-side). */
export function stagesOf(kind: Kind): string[] {
  return [...ROUTE[kind], OFF[kind]];
}

export const ALL_STAGES: readonly string[] = [...new Set([...stagesOf("idea"), ...stagesOf("bug")])];

export function isStage(kind: Kind, status: string): boolean {
  return stagesOf(kind).includes(status);
}

/** One label: single line, trimmed, bounded; empty → null. */
export function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX);
  return s || null;
}

/** Per-locale labels from untrusted JSON: known locales only, cleaned, empty ones dropped. */
export function cleanLabels(raw: unknown): Labels {
  if (!raw || typeof raw !== "object") return {};
  const out: Labels = {};
  for (const l of LOCALES) {
    const v = cleanLabel((raw as Record<string, unknown>)[l]);
    if (v) out[l] = v;
  }
  return out;
}

/** The stored rename map, validated (unknown statuses and locales are ignored). */
export function parseStatusLabels(raw: unknown): StatusLabels {
  if (!raw || typeof raw !== "object") return {};
  const out: StatusLabels = {};
  for (const s of ALL_STAGES) {
    const l = cleanLabels((raw as Record<string, unknown>)[s]);
    if (Object.keys(l).length) out[s] = l;
  }
  return out;
}

/**
 * A label in `locale`, else the board's default locale, else null (caller uses the built-in text).
 * Falling back to another enabled language beats the built-in word only when the admin wrote it for the default.
 */
export function pickLabel(labels: Labels | undefined, locale: Locale, fallback: Locale): string | null {
  if (!labels) return null;
  return labels[locale] ?? labels[fallback] ?? null;
}

/** Stage label override for one locale, or null for the built-in Ozvi word. */
export function stageOverride(map: StatusLabels, status: string, locale: Locale, fallback: Locale): string | null {
  return pickLabel(map[status], locale, fallback);
}

/** Label overrides as a flat { status: label } for one locale (merged into the "route.label" messages). */
export function overridesFor(map: StatusLabels, locale: Locale, fallback: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of Object.keys(map)) {
    const v = stageOverride(map, s, locale, fallback);
    if (v) out[s] = v;
  }
  return out;
}

/** Sub-status name in a locale; falls back to the default locale, then to any label it has. */
export function subLabel(sub: Pick<SubStatus, "labels">, locale: Locale, fallback: Locale): string {
  return pickLabel(sub.labels, locale, fallback) ?? Object.values(sub.labels).find(Boolean) ?? "";
}

/** A sub-status may be set only on items of its kind, and it always implies its stage. */
export function subFits(sub: Pick<SubStatus, "kind" | "stage">, kind: Kind): boolean {
  return sub.kind === kind && isStage(kind, sub.stage);
}

/**
 * The item's sub-status after a stage change: kept only while the item stays on that sub-status's stage.
 * (Moving to another stage clears it; the route speaks in stages.)
 */
export function subAfterStageChange(currentSub: Pick<SubStatus, "id" | "stage"> | null, newStage: string): string | null {
  return currentSub && currentSub.stage === newStage ? currentSub.id : null;
}

export function isLocaleKey(k: string): k is Locale { return isLocale(k); }
