/**
 * How a team member gets team e-mails ("My data" → Team e-mails): each one right away, or collected into one
 * summary an hour after the first one, or one summary every morning. Summaries reuse the deferred → digest path
 * of the outbox (worker.ts digests(), ADR-0006): the row is stored as `deferred` with `send_after` = when the
 * summary goes out, and the worker sends every deferred row of that person at the earliest such time.
 */
export const TEAM_MAIL_PACES = ["instant", "hourly", "daily"] as const;
export type TeamMailPace = (typeof TEAM_MAIL_PACES)[number];

export const isPace = (v: unknown): v is TeamMailPace => TEAM_MAIL_PACES.includes(v as TeamMailPace);

/**
 * Mails that only report activity to the team and may wait for a summary. Not here: the weekly team digest
 * and release drafts (already summaries), and anything a customer receives.
 */
export const SUMMARY_KINDS = new Set(["new_bug", "new_idea", "comment", "comment_internal", "comment_queued", "assigned", "bug_status", "idea_status"]);

/** The daily summary goes out at 8:00 in the boards' home time zone (customers are in Central Europe). */
const MORNING_HOUR = 8;
const ZONE = "Europe/Bratislava";

/** Minutes the zone is ahead of UTC at `at` (handles summer time). */
function zoneOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!);
  return Math.round((local - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** When a summary that starts collecting at `now` goes out; null = send right away. */
export function summaryAt(pace: TeamMailPace | undefined, now: Date = new Date()): Date | null {
  if (pace === "hourly") return new Date(now.getTime() + 3600_000);
  if (pace !== "daily") return null;
  const off = zoneOffsetMinutes(now);
  const local = new Date(now.getTime() + off * 60_000); // wall clock in the zone, read with getUTC*
  let target = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), MORNING_HOUR) - off * 60_000;
  if (target <= now.getTime()) {
    const next = new Date(target + 24 * 3600_000);
    target = next.getTime() + (off - zoneOffsetMinutes(next)) * 60_000; // summer time may change overnight
  }
  return new Date(target);
}
