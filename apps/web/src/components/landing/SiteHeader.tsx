"use client";

import { Check, ChevronDown, Globe, Menu } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { OzviLogo } from "@/components/ozvi/Logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { setLocale } from "@/i18n/actions";
import { LOCALE_NAME, LOCALES, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; title: string; text: string };
const home = (l: Locale) => (l === "sk" ? "/" : `/${l}`);

/** Language switcher for the landing: path-based pages, and the choice is remembered for the console. */
export function LangSwitch({ locale, label, className, align = "end" }: { locale: Locale; label: string; className?: string; align?: "start" | "end" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[13.5px] font-medium text-muted-foreground hover:bg-wash hover:text-foreground", className)} aria-label={`${label}: ${LOCALE_NAME[locale]}`}>
        <Globe className="size-4" aria-hidden />{locale.toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-44">
        {LOCALES.map((l) => (
          <DropdownMenuItem key={l} asChild>
            <Link href={home(l)} hrefLang={l} lang={l} onClick={() => void setLocale(l)} className="flex items-center justify-between gap-3">
              {LOCALE_NAME[l]}{l === locale && <Check className="size-4" aria-hidden />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Panel({ items, feature }: { items: NavItem[]; feature: NavItem }) {
  return (
    <div className="grid w-[640px] grid-cols-[1fr_220px] gap-2 p-2">
      <ul className="grid grid-cols-2 gap-1">
        {items.map((i) => (
          <li key={i.title}>
            <a href={i.href} className="block h-full rounded-lg p-3 hover:bg-wash">
              <span className="block text-[14px] font-semibold">{i.title}</span>
              <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{i.text}</span>
            </a>
          </li>
        ))}
      </ul>
      <a href={feature.href} className="grid content-between gap-6 rounded-lg border bg-background p-4 hover:border-line-strong">
        <span aria-hidden className="flex items-center pt-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="flex flex-1 items-center last:flex-none">
              <span className={cn("size-2.5 rounded-full", i < 4 ? "bg-primary" : "border-[1.5px] border-dashed border-line-strong")} />
              {i < 4 && <span className={cn("h-0.5 flex-1", i < 3 ? "bg-primary" : "bg-line")} />}
            </span>
          ))}
        </span>
        <span className="grid">
        <span className="text-[14px] font-semibold">{feature.title}</span>
        <span className="mt-1 text-[13px] leading-snug text-muted-foreground">{feature.text}</span>
        </span>
      </a>
    </div>
  );
}

/**
 * Landing header: transparent over the hero, a solid bar with a reading-progress hairline once
 * the page scrolls. Product and Developers open panels (hover with intent delay, click, Escape).
 */
export function SiteHeader({ locale, signedIn, soon = false }: { locale: Locale; signedIn: boolean; soon?: boolean }) {
  const t = useTranslations("landing");
  const productItems = t.raw("nav.productItems") as NavItem[], devItems = t.raw("nav.devItems") as NavItem[];

  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState<null | "product" | "dev">(null);
  const [sheet, setSheet] = useState(false);
  const bar = useRef<HTMLSpanElement>(null);
  const nav = useRef<HTMLDivElement>(null);
  const timer = useRef(0);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setScrolled(window.scrollY > 8);
        if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    const onDown = (e: PointerEvent) => { if (!nav.current?.contains(e.target as Node)) setOpen(null); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); cancelAnimationFrame(frame); };
  }, []);

  const hover = (id: typeof open) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(id), id ? 80 : 160); };
  const start = signedIn ? { href: "/app", label: t("nav.console") } : { href: "/app/login", label: t("nav.start") };
  const trigger = (id: "product" | "dev", label: string) => (
    <button type="button" aria-expanded={open === id} aria-controls={`nav-${id}`} onClick={() => setOpen(open === id ? null : id)}
      onPointerEnter={(e) => e.pointerType === "mouse" && hover(id)}
      className={cn("inline-flex h-9 items-center gap-1 rounded-md px-3 text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground", open === id && "text-foreground")}>
      {label}<ChevronDown className={cn("size-3.5 transition-transform", open === id && "rotate-180")} aria-hidden />
    </button>
  );

  return (
    <header className={cn("sticky top-0 z-40 border-b transition-[background-color,border-color] duration-200", scrolled || open ? "bg-background" : "border-transparent")}>
      <div className="oz-frame flex h-16 items-center gap-6">
        <Link href={home(locale)} aria-label="Ozvi"><OzviLogo markClassName="size-7" className="[&>span:last-child]:text-[21px]" /></Link>

        <div ref={nav} className="relative hidden items-center lg:flex" onPointerLeave={(e) => e.pointerType === "mouse" && hover(null)}>
          {trigger("product", t("nav.product"))}
          {trigger("dev", t("nav.developers"))}
          <a href="#pricing" className="inline-flex h-9 items-center rounded-md px-3 text-[14px] font-medium text-muted-foreground hover:text-foreground">{t("nav.pricing")}</a>
          <div className={cn("absolute top-full left-0 pt-3 transition-[opacity,translate] duration-150", open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")}>
            <div className="overflow-hidden rounded-xl border bg-surface shadow-[0_24px_60px_-24px_rgb(13_12_20/0.25)]" onClick={() => setOpen(null)}>
              <div id="nav-product" hidden={open !== "product"}><Panel items={productItems} feature={t.raw("nav.productFeature") as NavItem} /></div>
              <div id="nav-dev" hidden={open !== "dev"}><Panel items={devItems} feature={t.raw("nav.devFeature") as NavItem} /></div>
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <LangSwitch locale={locale} label={t("nav.language")} className="max-sm:hidden" />
          {!signedIn && !soon && <Link href="/app/login" className="hidden h-9 items-center rounded-md px-3 text-[14px] font-medium hover:bg-wash sm:inline-flex">{t("nav.signIn")}</Link>}
          {soon
            ? <span className="inline-flex h-9 items-center rounded-lg border border-dashed border-line-strong px-4 text-[14px] font-medium whitespace-nowrap text-muted-foreground">{t("nav.soon")}</span>
            : <Link href={start.href} className="inline-flex h-9 items-center rounded-lg bg-foreground px-4 text-[14px] font-semibold whitespace-nowrap text-background transition-opacity hover:opacity-85">{start.label}</Link>}
          <Sheet open={sheet} onOpenChange={setSheet}>
            <SheetTrigger className="grid size-9 place-items-center rounded-md hover:bg-wash lg:hidden" aria-label={t("nav.menu")}><Menu className="size-5" /></SheetTrigger>
            <SheetContent side="right" className="w-[320px] gap-0 overflow-y-auto bg-surface p-0">
              <SheetTitle className="border-b px-5 py-4"><OzviLogo markClassName="size-6" /></SheetTitle>
              <nav className="grid gap-6 px-5 py-6" onClick={(e) => (e.target as HTMLElement).closest("a") && setSheet(false)}>
                {([[t("nav.product"), productItems], [t("nav.developers"), devItems]] as const).map(([h, items]) => (
                  <div key={h}>
                    <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">{h}</p>
                    <ul className="grid gap-0.5">
                      {items.map((i) => <li key={i.title}><a href={i.href} className="block rounded-md px-2 py-2 text-[15px] font-medium hover:bg-wash">{i.title}</a></li>)}
                    </ul>
                  </div>
                ))}
                <div className="grid gap-0.5 border-t pt-4">
                  <a href="#pricing" className="rounded-md px-2 py-2 text-[15px] font-medium hover:bg-wash">{t("nav.pricing")}</a>
                  <a href="#self-host" className="rounded-md px-2 py-2 text-[15px] font-medium hover:bg-wash">{t("nav.selfHost")}</a>
                  {!signedIn && !soon && <Link href="/app/login" className="rounded-md px-2 py-2 text-[15px] font-medium hover:bg-wash">{t("nav.signIn")}</Link>}
                </div>
                <LangSwitch locale={locale} label={t("nav.language")} align="start" className="justify-self-start" />
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <span aria-hidden className={cn("absolute inset-x-0 -bottom-px h-px overflow-hidden transition-opacity", scrolled ? "opacity-100" : "opacity-0")}>
        <span ref={bar} className="absolute inset-0 origin-left scale-x-0 bg-primary" />
      </span>
    </header>
  );
}
