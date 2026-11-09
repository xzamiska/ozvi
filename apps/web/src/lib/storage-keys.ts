/**
 * Names and lifetimes of what Ozvi keeps in visitors' browsers, in one plain module (client-safe) so the
 * privacy kit (lib/privacy-kit*.ts) lists exactly what the code uses. privacy-kit.test.ts scans the sources
 * and fails when a new cookie or storage key appears without being listed here.
 */

/** Widget, changelog embed: the newest update the person has seen (packages/widget/src/seen.ts builds the full key). */
export const WIDGET_SEEN_PREFIX = "ozvi:seen:";
/** Board, team only: the remembered CSV separator (components/ExportMenu.tsx). */
export const CSV_SEP_KEY = "ozvi.csvSep";
/** Landing page only (not a board, not the widget): hero animation paused or playing. */
export const HERO_MOTION_KEY = "ozvi:hero-motion";
/** OIDC sign-in flow cookie lifetime in seconds (app/[project]/oidc/start). */
export const OIDC_FLOW_MAX_AGE = 600;
/** Explicit language choice (NEXT_LOCALE) lifetime in seconds. */
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;
