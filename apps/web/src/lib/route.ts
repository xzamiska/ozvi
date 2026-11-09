/**
 * The route ("trasa") a report travels. Each kind has ordered stops; declined / won't fix leave
 * the route. Stage tones are fixed by position so a status reads the same on every board.
 */

export type Kind = "bug" | "idea";

export const ROUTE: Record<Kind, readonly string[]> = {
  idea: ["open", "planned", "in_progress", "shipped"],
  bug: ["new", "confirmed", "in_progress", "fixed", "verified"],
};

export const OFF_ROUTE = new Set(["declined", "wont_fix"]);

/**
 * Texts for a stop, looked up by DB status in the `route` messages: short stop names (label), what
 * each stop means for the reporter (hint, shown on the route and in forms) and the next stop said as
 * what will happen (next, Journey's "next" row; never past tense for an unreached stop).
 * `t` is useTranslations("route") / translator(locale, "route"); unknown statuses get `fallback`.
 * Kept free of message imports so client components can use it (see route-text.ts for a locale).
 */
export type RouteGroup = "label" | "hint" | "next";
type RouteT = { has: (key: never) => boolean } & ((key: never) => string);
export function routeText(t: RouteT, group: RouteGroup, status: string, fallback = group === "label" ? status : ""): string {
  const key = `${group}.${status}` as never;
  return t.has(key) ? t(key) : fallback;
}

export type Tone = "wait" | "ack" | "work" | "done" | "off";

export function stopIndex(kind: Kind, status: string): number {
  return ROUTE[kind].indexOf(status);
}

export function toneOf(kind: Kind, status: string): Tone {
  if (OFF_ROUTE.has(status)) return "off";
  const i = stopIndex(kind, status);
  if (i <= 0) return "wait";
  if (status === "in_progress") return "work";
  if (i === 1) return "ack";
  return "done";
}
