import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The viewer's vote budget above the ideas list: a row of pips (shape, not just colour) and the words.
 * Exhausted says how to get votes back instead of only "0".
 */
export function VoteBudget({ left, budget, mode, className }: { left: number; budget: number; mode: "simple" | "importance"; className?: string }) {
  const t = useTranslations("forms.vote");
  const out = left <= 0;
  return (
    <div role="status" className={cn("mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-surface px-3.5 py-2.5 text-[13.5px]",
      out && "border-dashed", className)}>
      {budget <= 20 && (
        <span aria-hidden className="flex gap-1">
          {Array.from({ length: budget }, (_, i) => (
            <span key={i} className={cn("size-2 rounded-full border", i < left ? "border-brand bg-brand" : "border-line-strong")} />
          ))}
        </span>
      )}
      <span className="font-medium">{out ? t("exhaustedShort") : t("left", { n: left })}</span>
      <span className="text-muted-foreground">{out ? t("exhaustedHow") : mode === "importance" ? t("budgetHintImportance", { budget }) : t("budgetHint", { budget })}</span>
    </div>
  );
}
