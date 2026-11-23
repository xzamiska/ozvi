"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Board sections. Underline tabs; on phones the row scrolls sideways under the brand. */
export function BoardNav({ slug, className, unanswered = null, inbox = null, sections }: {
  slug: string; className?: string;
  /** The enabled sections (lib/sections), in board order. */
  sections: readonly string[];
  /** Team only: reports waiting for a reply (null = not team, no tab). */
  unanswered?: number | null;
  /** Team only: items with news since the person last marked the inbox read (null = not team). */
  inbox?: number | null;
}) {
  const path = usePathname();
  const kind = useSearchParams().get("kind");
  const t = useTranslations("board.nav");
  // Phones: the row scrolls sideways. The current tab is scrolled into view, and a fade on the cut edge
  // says there is more (the team's "New" and "Unanswered" sat off-screen at 390 px with no hint).
  const nav = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && (current.offsetLeft < el.scrollLeft || current.offsetLeft + current.offsetWidth > el.scrollLeft + el.clientWidth)) {
      el.scrollLeft = current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2;
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [path]);
  const fade = edges.left && edges.right ? "[mask-image:linear-gradient(to_right,transparent,#000_28px,#000_calc(100%-28px),transparent)]"
    : edges.right ? "[mask-image:linear-gradient(to_right,#000_calc(100%-28px),transparent)]"
    : edges.left ? "[mask-image:linear-gradient(to_right,transparent,#000_28px)]" : "";
  // The new-report form belongs to the section it files into.
  const onNew = path === `/${slug}/new`;
  const items = [
    ...(sections.includes("ideas") ? [{ href: `/${slug}/ideas`, label: t("ideas"), match: [`/${slug}/ideas`], newKind: true }] : []),
    ...(sections.includes("roadmap") ? [{ href: `/${slug}/roadmap`, label: t("roadmap"), match: [`/${slug}/roadmap`], newKind: false }] : []),
    ...(sections.includes("changelog") ? [{ href: `/${slug}/changelog`, label: t("changelog"), match: [`/${slug}/changelog`], newKind: false }] : []),
    ...(sections.includes("bugs") ? [{ href: `/${slug}/bugs`, label: t("bugs"), match: [`/${slug}/bugs`], newKind: false }] : []),
    ...(inbox !== null ? [{
      href: `/${slug}/inbox`, match: [`/${slug}/inbox`], newKind: false,
      label: (
        <span className="inline-flex items-center gap-1.5" title={t("inboxHint")}>
          {t("inbox")}
          {inbox > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 font-heading text-[11px] font-bold text-primary-foreground tabular-nums" data-num
              aria-label={t("inboxCount", { n: inbox })}>{inbox > 99 ? "99+" : inbox}</span>
          )}
        </span>
      ),
    }] : []),
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
    <nav ref={nav} aria-label="Board" data-more={edges.right || undefined} className={cn("-mb-px flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", fade, className)}>
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
