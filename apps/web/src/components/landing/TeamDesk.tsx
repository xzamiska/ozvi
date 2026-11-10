import { Camera, GitMerge, GitPullRequestArrow, Lock, MonitorSmartphone, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusMark } from "@/components/ozvi/route";
import { cn } from "@/lib/utils";

/**
 * The team's side of a board, for the landing's product tour: the bug queue and one report open
 * with what Ozvi attached and what the team does with it. Static sample, in the host's theme.
 * Every block mirrors a real screen: capture (BugCapture), similar items (MergeBox), team note,
 * GitHub links (GithubBox) and the route control that tells the reporter (RouteControl).
 */
const QUEUE = [{ n: 131, status: "new" }, { n: 128, status: "in_progress" }, { n: 127, status: "confirmed" }] as const;

export function TeamDesk() {
  const t = useTranslations("landing");
  const titles = t.raw("product.team.queue") as string[];
  const filters = t.raw("product.team.filters") as [string, string][];
  const r = { borderRadius: "var(--oz-radius)" };
  const chip = "inline-flex items-center gap-1 rounded bg-wash px-1.5 py-0.5 text-[11.5px] text-muted-foreground";

  return (
    <div className="flex h-[520px] flex-col max-md:h-auto">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-surface px-4">
        <b className="font-heading text-[14.5px] font-semibold">{t("product.team.title")}</b>
        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Lock className="size-3" />{t("product.team.private")}</span>
        <span className="ml-auto hidden gap-1 sm:flex">
          {filters.map(([label, n], i) => (
            <span key={label} style={r} className={cn("inline-flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium", i === 0 ? "bg-foreground text-background" : "text-muted-foreground")}>
              {label}<span data-num className="tabular-nums opacity-70">{n}</span>
            </span>
          ))}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[200px_minmax(0,1fr)]">
        {/* queue */}
        <ul className="hidden divide-y overflow-hidden border-r bg-surface md:block">
          {QUEUE.map((b, i) => (
            <li key={b.n} className={cn("grid gap-1 px-3.5 py-3", b.n === 128 && "bg-wash shadow-[inset_2px_0_0_var(--oz-accent)]")}>
              <span className="flex items-center justify-between gap-2">
                <span data-num className="text-[13px] font-extrabold tabular-nums">#{b.n}</span>
                <StatusMark kind="bug" status={b.status} className="size-3.5" />
              </span>
              <span className="line-clamp-2 text-[12.5px] leading-snug font-medium">{titles[i]}</span>
            </li>
          ))}
        </ul>

        {/* one report, open */}
        <div className="min-w-0 overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-baseline gap-2">
                <span data-num className="text-[18px] leading-none font-extrabold tracking-tight">#128</span>
                <span className="truncate text-[14.5px] font-semibold">{titles[1]}</span>
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">{t("product.team.reporter")}</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className={chip}><Camera className="size-3" />{t("product.team.shot")}</span>
            <span className={cn(chip, "font-mono")}>v2.14.0</span>
            <span className={chip}><MonitorSmartphone className="size-3" />Chrome 141 · macOS</span>
            <span className={cn(chip, "font-mono")}>/kalendar/2026-11-14</span>
          </div>
          <p className="mt-2 flex items-start gap-1.5 rounded-md border bg-surface px-2.5 py-2 font-mono text-[11.5px] leading-snug" style={r}>
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
            <span className="min-w-0 break-words">{t("product.team.console")}</span>
          </p>

          <div className="mt-3 flex items-center gap-2.5 border bg-surface px-3 py-2 text-[12.5px]" style={r}>
            <GitMerge className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t("product.team.similar")}</span>
            <span className="shrink-0 font-semibold text-brand-text">{t("product.team.merge")}</span>
          </div>

          <div className="mt-3 border border-dashed bg-st-ack/8 px-3 py-2.5" style={r}>
            <p className="text-[11.5px] font-semibold text-muted-foreground">{t("product.team.noteLabel")}</p>
            <p className="mt-1 text-[12.5px] leading-snug">{t("product.team.note")}</p>
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <span className="inline-flex items-center gap-1.5"><GitPullRequestArrow className="size-3.5 text-muted-foreground" />acme/app#482</span>
            <span className="text-muted-foreground">{t("product.team.pr")}</span>
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="inline-flex h-8 items-center gap-1.5 border border-input bg-surface px-2.5 text-[12.5px] font-semibold" style={r}>
              <StatusMark kind="bug" status="fixed" />{t("product.team.fixedIn")} 2.15
            </span>
            <span className="inline-flex h-8 items-center bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground" style={r}>{t("product.team.save")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
