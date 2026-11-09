import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Footer under a paged list: how many of how many are shown, and a link that shows the next page
 * (the URL keeps filters, sort and search; scroll stays where it is).
 */
export function LoadMore({ href, shown, total, className }: { href: string | null; shown: number; total: number; className?: string }) {
  const t = useTranslations("board.paging");
  if (!href && shown >= total) return null;
  return (
    <div className={cn("mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}>
      <p className="text-[13px] text-muted-foreground tabular-nums">{t("shown", { shown, total })}</p>
      {href && <Button asChild variant="outline" size="sm"><Link href={href} scroll={false} prefetch={false}>{t("more")}</Link></Button>}
    </div>
  );
}
