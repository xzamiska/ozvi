import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Visible AI label (EU AI Act art. 50): text written with AI says so, and once a person approved it,
 * who did. Drafts say they still wait for a review. The model id is in the tooltip and for screen readers.
 */
export function AiBadge({ model, reviewer, reviewed, className }: {
  model: string; reviewer: string | null; reviewed: boolean; className?: string;
}) {
  const t = useTranslations("ai.badge");
  const text = reviewed ? (reviewer ? t("reviewed", { name: reviewer }) : t("reviewedAnon")) : t("draft");
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium text-muted-foreground", className)}
      title={t("model", { model })} data-ai-generated="true" data-ai-model={model}>
      <Sparkles aria-hidden className="size-3.5 shrink-0" />
      <span>{text}<span className="sr-only"> ({t("model", { model })})</span></span>
    </span>
  );
}
