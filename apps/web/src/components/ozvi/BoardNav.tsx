"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Board sections. Underline tabs; on phones the row scrolls sideways under the brand. */
export function BoardNav({ slug, className, unanswered = null }: {
  slug: string; className?: string;
  /** Team only: reports waiting for a reply (null = not team, no tab). */
  unanswered?: number | null;
}) {
  const path = usePathname();
  const kind = useSearchParams().get("kind");
  const t = useTranslations("board.nav");
  // The new-report form belongs to the section it files into.
  const onNew = path === `/${slug}/new`;
  const items = [
    { href: `/${slug}/ideas`, label: t("ideas"), match: [`/${slug}/ideas`], newKind: true },
    { href: `/${slug}/roadmap`, label: t("roadmap"), match: [`/${slug}/roadmap`], newKind: false },
    { href: `/${slug}/changelog`, label: t("changelog"), match: [`/${slug}/changelog`], newKind: false },
    { href: `/${slug}/bugs`, label: t("bugs"), match: [`/${slug}/bugs`], newKind: false },
    ...(unanswered !== null ? [{
      href: `/${slug}/unanswered`, match: [`/${slug}/unanswered`], newKind: false,
      label: (
        <span className="inline-flex items-center gap-1.5" title={t("unansweredHint")}>
          {t("unanswered")}
          {unanswered > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-st-ack/18 px-1 font-heading text-[11px] font-bold text-foreground tabular-nums ring-1 ring-st-ack/45 ring-inset" data-num
              aria-label={t("unansweredCount", { n: unanswered })}>{unanswered > 99 ? "99+" : unanswered}</span>
          )}
        </span>
      ),
    }] : []),
  ];
  return (
    <nav aria-label="Board" className={cn("-mb-px flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {items.map((it) => {
        const active = it.match.some((m) => path === m || path.startsWith(`${m}/`))
          || (onNew && (kind === "bug" ? it.href === `/${slug}/bugs` : it.newKind));
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex shrink-0 items-center px-2.5 text-[14.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:px-3",
              "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors sm:after:inset-x-3",
              active && "text-foreground after:bg-brand",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Header sign-in for visitors; hidden on the sign-in page itself. */
export function HeaderLogin({ slug, href }: { slug: string; href: string }) {
  const path = usePathname();
  const t = useTranslations("board.shell");
  if (path === `/${slug}/login` || path.startsWith(`/${slug}/login/`)) return null;
  return <Button asChild variant="outline" size="sm"><a href={href}>{t("signIn")}</a></Button>;
}
