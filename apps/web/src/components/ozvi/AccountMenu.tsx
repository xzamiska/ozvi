"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";

export function AccountMenu({ slug, name, email, avatarUrl, role, consoleHref }: {
  slug: string; name: string | null; email: string | null; avatarUrl: string | null; role: string; consoleHref?: string | null;
}) {
  const t = useTranslations("board.account");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-offset-2" aria-label={t("menu")}>
        <Avatar name={name ?? email} url={avatarUrl} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="truncate font-semibold">{name ?? email ?? t("signedIn")}</span>
          {name && email && <span className="truncate text-xs text-muted-foreground">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href={`/${slug}/me`}>{t("me")}</Link></DropdownMenuItem>
        {role !== "member" && <DropdownMenuItem asChild><Link href={`/${slug}/tokens`}>{t("tokens")}</Link></DropdownMenuItem>}
        {role === "admin" && <DropdownMenuItem asChild><Link href={`/${slug}/admin`}>{t("settings")}</Link></DropdownMenuItem>}
        {consoleHref && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><a href={consoleHref}>{t("console")}</a></DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <form action={`/${slug}/logout`} method="post">
          <DropdownMenuItem asChild><button type="submit" className="w-full">{t("signOut")}</button></DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
