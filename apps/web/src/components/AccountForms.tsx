"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Avatar } from "@/components/Avatar";
import { LanguageSubmenu } from "@/components/ozvi/LanguageMenu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deleteAccountAction, inviteAction, renameAction, requestEmailChangeAction, type FormState, renameWorkspaceAction } from "@/lib/account-actions";
import { signOutApp } from "@/lib/app-actions";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

function Status({ state }: { state: FormState }) {
  if (state.error) return <p className="text-[14px] font-medium text-destructive" role="alert">{state.error}</p>;
  if (state.info) return <p className="text-[14px] font-medium text-success" role="status">{state.info}</p>;
  return null;
}

const labelCls = "text-[14px] font-semibold";

/** Account dropdown in the /app header. */
export function AppAccountMenu({ name, email }: { name: string | null; email: string }) {
  const t = useTranslations("console.nav");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full outline-offset-2" aria-label={t("account", { email })}>
        <span className="hidden max-w-[220px] truncate text-[13.5px] font-medium text-muted-foreground sm:block">{email}</span>
        <Avatar name={name ?? email} size={32} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="truncate font-semibold">{name ?? t("signedIn")}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/app/account"><UserRound />{t("myAccount")}</Link></DropdownMenuItem>
        <LanguageSubmenu />
        <DropdownMenuSeparator />
        <form action={signOutApp}>
          <DropdownMenuItem asChild><button type="submit" className="w-full"><LogOut />{t("signOut")}</button></DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Submit({ children, busy, ...props }: React.ComponentProps<typeof Button> & { busy: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} aria-busy={pending || undefined} {...props}>{pending ? busy : children}</Button>;
}

/** A button that asks before running a destructive server action (bound on the server). */
export function ConfirmAction({ action, label, title, description, confirm }: {
  action: () => Promise<void>; label: string; title: string; description: React.ReactNode; confirm: string;
}) {
  const t = useTranslations("account.forms");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive">{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={action}>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">{t("keep")}</Button></DialogClose>
            <Submit variant="destructive" busy={t("working")}>{confirm}</Submit>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Role select + save for one member (owners only). */
export function RoleForm({ action, role, email }: { action: (form: FormData) => Promise<void>; role: string; email: string }) {
  const [value, setValue] = useState(role);
  const t = useTranslations("account.forms");
  return (
    <form action={action} className="flex items-center gap-2">
      <Select name="role" value={value} onValueChange={setValue}>
        <SelectTrigger size="sm" className="w-[112px] bg-surface" aria-label={t("roleOf", { email })}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="member">{t("member")}</SelectItem>
          <SelectItem value="owner">{t("owner")}</SelectItem>
        </SelectContent>
      </Select>
      {value !== role && <Submit size="sm" busy={t("saving")}>{t("changeRole")}</Submit>}
    </form>
  );
}

export function InviteForm({ workspaceId }: { workspaceId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>((p, f) => inviteAction(workspaceId, p, f), {});
  const t = useTranslations("account.forms");
  return (
    <form action={action} className="grid gap-4 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_230px]">
        <div className="grid gap-2">
          <Label htmlFor="invite-email" className={labelCls}>{t("email")}</Label>
          <Input id="invite-email" name="email" type="email" required autoComplete="off" placeholder={t("invitePlaceholder")} className="h-10 bg-surface" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role" className={labelCls}>{t("role")}</Label>
          <Select name="role" defaultValue="member">
            <SelectTrigger id="invite-role" className="h-10! w-full bg-surface"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="member">{t("member")}</SelectItem>
              <SelectItem value="owner">{t("owner")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="-mt-1 text-[13px] text-muted-foreground">{t("roleHint")}</p>
      <Status state={state} />
      <div><Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? t("sending") : t("sendInvite")}</Button></div>
    </form>
  );
}

/** Workspace name (owners); members see it read-only on the same page. */
export function WorkspaceNameForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>((p, f) => renameWorkspaceAction(workspaceId, p, f), {});
  const t = useTranslations("console.settings");
  return (
    <form action={action} className="grid gap-4 p-4 sm:p-5">
      <div className="grid max-w-md gap-2">
        <Label htmlFor="ws-name" className={labelCls}>{t("name")}</Label>
        <Input id="ws-name" name="name" defaultValue={name} required minLength={2} maxLength={60} autoComplete="off" className="h-10 bg-surface" />
        <p className="text-[13px] text-muted-foreground">{t("nameHint")}</p>
      </div>
      <Status state={state} />
      <div><Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? t("saving") : t("save")}</Button></div>
    </form>
  );
}

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(renameAction, {});
  const t = useTranslations("account.forms");
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="acc-name" className={labelCls}>{t("name")} <span className="font-normal text-muted-foreground">{t("nameHint")}</span></Label>
        <Input id="acc-name" name="name" defaultValue={name} maxLength={80} autoComplete="name" className="h-10 bg-surface sm:max-w-sm" />
      </div>
      <Status state={state} />
      <div><Button type="submit" variant="outline" disabled={pending}>{pending ? t("saving") : t("saveName")}</Button></div>
    </form>
  );
}

export function EmailForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestEmailChangeAction, {});
  const t = useTranslations("account.forms");
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="acc-email" className={labelCls}>{t("newEmail")}</Label>
        <Input id="acc-email" name="email" type="email" required autoComplete="email" className="h-10 bg-surface sm:max-w-sm" aria-describedby="acc-email-hint" />
        <p id="acc-email-hint" className="text-[13px] text-muted-foreground">
          {t.rich("emailHint", { email, b: (chunks) => <b className="font-semibold break-all text-foreground">{chunks}</b> })}
        </p>
      </div>
      <Status state={state} />
      <div><Button type="submit" variant="outline" disabled={pending}>{pending ? t("sending") : t("sendLink")}</Button></div>
    </form>
  );
}

export function DeleteAccountForm({ email, blocked }: { email: string; blocked: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccountAction, {});
  const [typed, setTyped] = useState("");
  const t = useTranslations("account.forms");
  const match = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="acc-confirm" className={cn(labelCls, "block leading-snug")}>
          {t("confirmDelete")} <code className="rounded bg-muted px-1 py-0.5 font-mono text-[13px] font-medium break-all">{email}</code>
        </Label>
        <Input id="acc-confirm" name="confirm" autoComplete="off" spellCheck={false} disabled={blocked} value={typed}
          onChange={(e) => setTyped(e.target.value)} className="h-10 bg-surface sm:max-w-sm" />
      </div>
      <Status state={state} />
      <div>
        <Button type="submit" variant="destructive" disabled={pending || blocked || !match} aria-busy={pending || undefined}>
          {pending ? t("deleting") : t("deleteForever")}
        </Button>
      </div>
    </form>
  );
}
