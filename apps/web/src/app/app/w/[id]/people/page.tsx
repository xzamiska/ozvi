import { AlertTriangle } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ConfirmAction, InviteForm, RoleForm } from "@/components/AccountForms";
import { Avatar } from "@/components/Avatar";
import { ConsoleHead } from "@/components/ozvi/console";
import { Panel } from "@/components/ozvi/page";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAccount, workspacesOf } from "@/lib/account";
import { removeMemberAction, revokeInviteAction, setRoleAction } from "@/lib/account-actions";
import { day } from "@/components/ozvi/console";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { people } from "@/lib/workspace";
import { consoleTitle } from "@/lib/board-meta";

export const generateMetadata = consoleTitle("team");

export const dynamic = "force-dynamic";


function SectionHead({ id, title, count }: { id: string; title: string; count?: number }) {
  return (
    <h2 id={id} className="flex items-baseline gap-2 font-heading text-[17px] font-bold tracking-tight">
      {title}{count !== undefined && <span className="text-[14px] font-semibold text-muted-foreground tabular-nums">{count}</span>}
    </h2>
  );
}

export default async function People({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const { id } = await params;
  const { e } = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = (await workspacesOf(account.id)).find((w) => w.id === id);
  if (!ws) notFound();
  const owner = ws.role === "owner";
  const { members, pending } = await people(ws.id);
  const owners = members.filter((m) => m.role === "owner").length;
  const locale = await requestLocale();
  const c = await getTranslations("console");
  const t = await getTranslations("console.people");
  const error = e === "last_owner" || e === "not_owner" ? t(`errors.${e}`) : null;
  const roleLabel = (r: string) => r === "owner" || r === "member" ? c(`role.${r}`) : r;

  return (
    <div>
      <ConsoleHead
        title={t("title")}
        lede={t("lede", { ws: ws.name })}
      />
      {error && (
        <Alert variant="destructive" className="mb-6 border-destructive/30">
          <AlertTriangle />
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-10">
        <section aria-labelledby="members-h" className="grid gap-3">
          <SectionHead id="members-h" title={t("members")} count={members.length} />
          <Panel as="ul" className="divide-y">
            {members.map((m) => {
              const self = m.id === account.id;
              const lastOwner = m.role === "owner" && owners <= 1;
              const who = m.name ?? m.email;
              return (
                <li key={m.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={who} size={36} />
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-semibold">
                        {who}{self && <span className="font-normal text-muted-foreground"> {t("you")}</span>}
                      </div>
                      <div className="truncate text-[13px] text-muted-foreground">
                        {m.name ? `${m.email}, ` : ""}{t("since")}<span className="tabular-nums">{day(m.since, locale)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-12 sm:justify-end sm:pl-0">
                    {owner && !lastOwner
                      ? <RoleForm action={setRoleAction.bind(null, ws.id, m.id)} role={m.role} email={m.email} />
                      : <Badge variant="outline" className="rounded-sm">{roleLabel(m.role)}</Badge>}
                    {(owner || self) && !lastOwner && (
                      <ConfirmAction
                        action={removeMemberAction.bind(null, ws.id, m.id)}
                        label={self ? t("leave") : t("remove")}
                        title={self ? t("leaveTitle", { ws: ws.name }) : t("removeTitle", { who })}
                        description={self ? t("leaveText") : t("removeText", { who, ws: ws.name })}
                        confirm={self ? t("leave") : t("removeConfirm")}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </Panel>
        </section>

        {owner && pending.length > 0 && (
          <section aria-labelledby="pending-h" className="grid gap-3">
            <SectionHead id="pending-h" title={t("pending")} count={pending.length} />
            <Panel as="ul" className="divide-y">
              {pending.map((i) => (
                <li key={i.id} className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] font-semibold">{i.email}</div>
                    <div className="text-[13px] text-muted-foreground">{roleLabel(i.role)}, {t("validUntil")}<span className="tabular-nums">{day(i.expiresAt, locale)}</span></div>
                  </div>
                  <div className="flex sm:justify-end">
                    <ConfirmAction
                      action={revokeInviteAction.bind(null, ws.id, i.id)}
                      label={t("revoke")}
                      title={t("revokeTitle", { email: i.email })}
                      description={t("revokeText")}
                      confirm={t("revoke")}
                    />
                  </div>
                </li>
              ))}
            </Panel>
          </section>
        )}

        {owner && (
          <section aria-labelledby="invite-h" className="grid gap-3">
            <SectionHead id="invite-h" title={t("invite")} />
            <Panel><InviteForm workspaceId={ws.id} /></Panel>
          </section>
        )}
      </div>
    </div>
  );
}
