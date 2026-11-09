"use client";

import { Activity, ArrowUpRight, Check, ChevronsUpDown, CreditCard, LayoutGrid, LogOut, Menu, Plus, Send, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { LanguageSubmenu } from "@/components/ozvi/LanguageMenu";
import { OzviLogo } from "@/components/ozvi/Logo";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTranslations } from "next-intl";
import { signOutApp } from "@/lib/app-actions";
import { cn } from "@/lib/utils";

export interface NavWorkspace { id: string; name: string; plan: string }
export interface ShellProps {
  ws: NavWorkspace;
  all: NavWorkspace[];
  projects: { slug: string; name: string }[];
  account: { name: string | null; email: string };
  cloud: boolean;
  attention: { delivery?: number; plan?: boolean };
}

/** Workspace switcher: the console always works inside one workspace ("priestor"). */
function WorkspaceSwitcher({ current, all }: { current: NavWorkspace; all: NavWorkspace[] }) {
  const m = useTranslations("console");
  const t = useTranslations("console.nav");
  const planName = (p: string) => p === "self" || p === "free" || p === "pro" || p === "studio" ? m(`planName.${p}`) : p;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-offset-2 hover:bg-wash">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-[13px] font-semibold text-surface">
          {current.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-[13.5px] font-semibold">{current.name}</span>
          <span className="truncate text-[12px] text-muted-foreground">{t("workspace")} · {planName(current.plan)}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="sr-only">{t("switchWorkspace")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-60">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("yourWorkspaces")}</DropdownMenuLabel>
        {all.map((w) => (
          <DropdownMenuItem key={w.id} asChild>
            <Link href={`/app/w/${w.id}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="text-xs text-muted-foreground">{planName(w.plan)}</span>
              {w.id === current.id && <Check className="size-4" aria-label={t("current")} />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/app/new"><Plus />{t("newWorkspace")}</Link></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountRow({ name, email }: { name: string | null; email: string }) {
  const t = useTranslations("console.nav");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-offset-2 hover:bg-wash" aria-label={t("account", { email })}>
        <Avatar name={name || email} size={28} />
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-[13px] font-medium">{name || t("noName")}</span>
          <span className="truncate text-[12px] text-muted-foreground">{email}</span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56">
        <DropdownMenuItem asChild><Link href="/app/account"><UserRound />{t("myAccount")}</Link></DropdownMenuItem>
        <LanguageSubmenu />
        <DropdownMenuItem asChild><Link href="/"><ArrowUpRight />{t("website")}</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutApp}>
          <DropdownMenuItem asChild><button type="submit" className="w-full"><LogOut />{t("signOut")}</button></DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavBody({ ws, all, projects, account, cloud, attention }: ShellProps) {
  const path = usePathname();
  const t = useTranslations("console.nav");
  const base = `/app/w/${ws.id}`;
  const items = [
    { href: base, label: t("overview"), icon: LayoutGrid, exact: true },
    { href: `${base}/people`, label: t("team"), icon: Users },
    ...(cloud ? [{ href: `${base}/plan`, label: t("plan"), icon: CreditCard, dot: attention.plan }] : []),
    { href: `${base}/delivery`, to: attention.delivery ? `${base}/delivery?f=problems` : undefined, label: t("delivery"), icon: Send, count: attention.delivery },
    { href: `${base}/activity`, label: t("activity"), icon: Activity },
  ];
  return (
    <div className="flex h-full flex-col gap-5">
      <WorkspaceSwitcher current={ws} all={all} />
      <nav aria-label={t("console")}>
        <ul className="grid gap-px">
          {items.map(({ href, to, label, icon: Icon, exact, dot, count }: { href: string; to?: string; label: string; icon: typeof Send; exact?: boolean; dot?: boolean; count?: number }) => {
            const active = exact ? path === href : path.startsWith(href);
            return (
              <li key={href}>
                <Link href={to ?? href} aria-current={active ? "page" : undefined}
                  className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-wash hover:text-foreground",
                    active && "bg-wash text-foreground")}>
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{label}</span>
                  {count ? <span className="rounded-full bg-destructive/12 px-1.5 text-[11.5px] leading-[18px] font-semibold text-destructive tabular-nums" aria-label={t("failures", { count })}>{count}</span> : null}
                  {dot && <span className="size-2 rounded-full bg-destructive" aria-label={t("attention")} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="grid gap-1">
        <div className="flex items-center justify-between px-2">
          <h2 className="text-[12px] font-medium text-muted-foreground">{t("projects")}</h2>
          <Link href={`/app/new?w=${ws.id}`} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-wash hover:text-foreground" aria-label={t("newProject")}><Plus className="size-3.5" /></Link>
        </div>
        <ul className="grid gap-px">
          {projects.map((p) => (
            <li key={p.slug}>
              <a href={`/app/open/${p.slug}`} className="group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] text-muted-foreground hover:bg-wash hover:text-foreground">
                <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-[4px] border text-[9.5px] font-semibold">{p.name.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-label={t("openBoard")} />
              </a>
            </li>
          ))}
          {projects.length === 0 && <li className="px-2 text-[13px] text-muted-foreground">{t("noProjects")}</li>}
        </ul>
      </div>
      <div className="mt-auto border-t pt-3"><AccountRow {...account} /></div>
    </div>
  );
}

/** Console chrome: a full-height sidebar on desktop, a top bar with a sheet on phones. */
export function ConsoleShell(props: ShellProps & { children: React.ReactNode }) {
  const { children, ...nav } = props;
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const t = useTranslations("console.nav");
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-surface px-3 pt-4 pb-3 md:flex">
        <Link href="/app" className="mb-5 inline-flex px-2" aria-label={t("home")}><OzviLogo markClassName="size-6" className="[&>span:last-child]:text-[18px]" /></Link>
        <div className="min-h-0 flex-1 overflow-y-auto"><NavBody {...nav} /></div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-surface/90 px-4 backdrop-blur md:hidden">
        <Link href="/app" aria-label={t("home")}><OzviLogo markClassName="size-6" className="[&>span:last-child]:text-[18px]" /></Link>
        <span className="min-w-0 flex-1 truncate border-l pl-3 text-[13.5px] font-medium">{nav.ws.name}</span>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="relative grid size-9 place-items-center rounded-md border" aria-label={t("menu")}>
            <Menu className="size-4" />
            {(nav.attention.delivery || nav.attention.plan) ? <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive" /> : null}
          </SheetTrigger>
          <SheetContent side="left" className="w-[290px] bg-surface px-3 pt-5 pb-3">
            <SheetTitle className="sr-only">{t("menuTitle")}</SheetTitle>
            <NavBody {...nav} />
          </SheetContent>
        </Sheet>
      </header>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
