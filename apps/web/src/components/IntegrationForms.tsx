"use client";

import { Plug, Send } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addWebhook, createToken, deleteWebhook, disconnectGithub, revokeToken, saveDomain, saveGithub, saveOidc,
  setRole, signOutEverywhere, testWebhook, verifyDomain, type ActState,
} from "@/lib/integration-actions";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ChoiceLabel, codeBox, ConfirmAction, CopyButton, Field, hint, noFill, panel, Result, SecretBox } from "./settings";

function Feedback({ state, children }: { state: ActState; children?: React.ReactNode }) {
  if (state.secret) return <SecretBox title={state.ok} secret={state.secret}>{children}</SecretBox>;
  return <Result error={state.error} ok={state.ok} />;
}

function Choices({ legend, name, defaultValue, options }: {
  legend: React.ReactNode; name: string; defaultValue: string; options: { value: string; title: string; text: React.ReactNode }[];
}) {
  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-2.5 text-[14px] font-semibold">{legend}</legend>
      <RadioGroup name={name} defaultValue={defaultValue} className="gap-2.5">
        {options.map((o) => (
          <div key={o.value} className="grid grid-cols-[16px_1fr] items-start gap-2.5">
            <RadioGroupItem id={`${name}-${o.value}`} value={o.value} className="mt-0.5" />
            <ChoiceLabel htmlFor={`${name}-${o.value}`} title={o.title} text={o.text} />
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function CheckRow({ id, name, value, defaultChecked, children }: { id: string; name: string; value?: string; defaultChecked?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[16px_1fr] items-start gap-2.5">
      <Checkbox id={id} name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5" />
      <Label htmlFor={id} className="block cursor-pointer text-[14px] leading-snug font-normal">{children}</Label>
    </div>
  );
}

const Submit = ({ pending, children, pendingLabel }: { pending: boolean; children: React.ReactNode; pendingLabel: string }) => (
  <Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? pendingLabel : children}</Button>
);

/* ---------- API tokens ---------- */

export function TokenForm({ slug, mcpUrl, canTriage }: { slug: string; mcpUrl: string; canTriage: boolean }) {
  const t = useTranslations("integrations.token");
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => createToken(slug, p, f), {});
  const cmd = state.secret ? `claude mcp add --transport http ozvi ${mcpUrl} --header "Authorization: Bearer ${state.secret}"` : "";
  return (
    <form action={action} className={panel}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Field id="tk-name" label={t("name")} hint={t("nameHint")}>
          <Input id="tk-name" name="name" required minLength={2} maxLength={60} placeholder={t("namePlaceholder")} {...noFill} />
        </Field>
        <Field id="tk-days" label={t("validity")}>
          <Select name="days" defaultValue="90">
            <SelectTrigger id="tk-days" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">{t("days", { n: 30 })}</SelectItem>
              <SelectItem value="90">{t("days", { n: 90 })}</SelectItem>
              <SelectItem value="365">{t("year")}</SelectItem>
              <SelectItem value="0">{t("forever")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Choices legend={t("what")} name="scope" defaultValue="read" options={[
        { value: "read", title: t("read.title"), text: t("read.text") },
        { value: "write", title: t("write.title"), text: t("write.text") },
        ...(canTriage ? [{ value: "triage", title: t("triage.title"), text: t("triage.text") }] : []),
      ]} />
      {state.secret ? (
        <SecretBox title={state.ok} secret={state.secret}>
          <div className="grid gap-2">
            <span>{t("claudeCode")}</span>
            <code className={cn(codeBox, "bg-surface text-foreground")}>{cmd}</code>
            <CopyButton text={cmd} label={t("copyCmd")} className="justify-self-start" />
          </div>
        </SecretBox>
      ) : <Result error={state.error} />}
      <div><Submit pending={pending} pendingLabel={t("creating")}>{t("create")}</Submit></div>
    </form>
  );
}

export function RevokeToken({ slug, id, name }: { slug: string; id: string; name?: string }) {
  const t = useTranslations("integrations.token");
  return (
    <ConfirmAction run={async () => { await revokeToken(slug, id); toast(name ? t("revoked", { name }) : t("revokedUnnamed")); }}
      trigger={t("revoke")} title={name ? t("revokeTitle", { name }) : t("revokeTitleUnnamed")} confirm={t("revoke")} pending={t("revoking")}
      text={t("revokeText")} />
  );
}

/* ---------- Webhooks ---------- */

/** Webhook event → its label key (message keys cannot contain dots). */
const EVENTS = [
  ["item.created", "item_created"], ["item.status_changed", "item_status_changed"], ["comment.created", "comment_created"],
  ["item.merged", "item_merged"], ["item.linked", "item_linked"], ["changelog.published", "changelog_published"], ["item.tags_changed", "item_tags_changed"],
] as const;

export function WebhookForm({ slug }: { slug: string }) {
  const t = useTranslations("integrations.webhook");
  const [key, setKey] = useState(0);
  const [state, action, pending] = useActionState(async (p: ActState, f: FormData) => {
    const r = await addWebhook(slug, p, f);
    if (!r.error && !r.secret) setKey((k) => k + 1);
    return r;
  }, {});
  return (
    <form key={key} action={action} className={panel}>
      <Field id="wh-url" label={t("url")}>
        <Input id="wh-url" name="url" type="url" required placeholder="https://hooks.slack.com/services/…" spellCheck={false} {...noFill} />
      </Field>
      <Choices legend={t("format")} name="format" defaultValue="slack" options={[
        { value: "slack", title: t("chat.title"), text: t("chat.text") },
        { value: "teams", title: t("teams.title"), text: t("teams.text") },
        { value: "discord", title: t("discord.title"), text: t("discord.text") },
        { value: "json", title: t("json.title"), text: t("json.text") },
      ]} />
      <fieldset className="grid gap-2.5">
        <legend className="mb-1 text-[14px] font-semibold">{t("eventsLegend")}</legend>
        <p className={cn(hint, "mb-1")}>{t("eventsHint")}</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {EVENTS.map(([v, k]) => <CheckRow key={v} id={`ev-${v}`} name="events" value={v}>{t(`events.${k}`)}</CheckRow>)}
        </div>
      </fieldset>
      <CheckRow id="wh-bugs" name="includeBugs">
        {t("bugs")} <span className="text-muted-foreground">{t("bugsNote")}</span>
      </CheckRow>
      <Feedback state={state} />
      <div><Submit pending={pending} pendingLabel={t("adding")}>{t("add")}</Submit></div>
    </form>
  );
}

export function WebhookActions({ slug, id }: { slug: string; id: string }) {
  const t = useTranslations("integrations.webhook");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActState>({});
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-live="polite" className={cn("min-w-0 text-[13px] font-medium [overflow-wrap:anywhere]", result.error ? "text-destructive" : "text-success")}>{result.error ?? result.ok}</span>
      <Button type="button" variant="outline" size="sm" disabled={pending} aria-busy={pending || undefined}
        onClick={() => start(async () => setResult(await testWebhook(slug, id)))}>
        <Send />{pending ? t("sending") : t("test")}
      </Button>
      <ConfirmAction run={async () => { await deleteWebhook(slug, id); toast(t("removed")); }} trigger={t("remove")}
        title={t("removeTitle")} text={t("removeText")} confirm={t("removeConfirm")} pending={t("removing")} />
    </div>
  );
}

/* ---------- GitHub ---------- */

export function GithubForm({ slug, repo, onClose, connected, hookUrl }: { slug: string; repo: string; onClose: string; connected: boolean; hookUrl: string }) {
  const T = useTranslations("integrations");
  const t = useTranslations("integrations.github");
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => saveGithub(slug, p, f), {});
  return (
    <form action={action} className={panel}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="gh-repo" label={t("repo")} hint={t("repoHint")}>
          <Input id="gh-repo" name="repo" required defaultValue={repo} placeholder="firma/app" pattern="[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+" spellCheck={false} {...noFill} />
        </Field>
        <Field id="gh-token" label={t("token")} hint={connected ? t("keepToken") : t("tokenHint")}>
          <Input id="gh-token" name="token" type="password" autoComplete="off" placeholder={connected ? "••••••••" : "github_pat_…"} required={!connected} />
        </Field>
      </div>
      <Choices legend={t("onClose")} name="onClose" defaultValue={onClose === "fixed" ? "fixed" : "release"} options={[
        { value: "release", title: t("release.title"), text: t("release.text") },
        { value: "fixed", title: t("fixed.title"), text: t("fixed.text") },
      ]} />
      <Feedback state={state}>
        {t("hookA")} <code className="font-mono break-all text-foreground">{hookUrl}</code>{t("hookB")}
      </Feedback>
      <div className="flex flex-wrap items-center gap-2">
        <Submit pending={pending} pendingLabel={T("verifying")}>{connected ? t("save") : <><Plug />{t("connect")}</>}</Submit>
        {connected && (
          <ConfirmAction run={async () => { await disconnectGithub(slug); toast(t("disconnected")); }} trigger={t("disconnect")} variant="ghost" size="default"
            title={t("disconnectTitle")} text={t("disconnectText")}
            confirm={t("disconnectConfirm")} pending={t("disconnecting")} />
        )}
      </div>
    </form>
  );
}

/* ---------- OIDC ---------- */

export function OidcForm({ slug, issuer, clientId, hasSecret, callback }: { slug: string; issuer: string; clientId: string; hasSecret: boolean; callback: string }) {
  const T = useTranslations("integrations");
  const t = useTranslations("integrations.oidc");
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => saveOidc(slug, p, f), {});
  return (
    <form action={action} className={panel}>
      <Field id="oidc-issuer" label="Issuer" hint={t("issuerHint")}>
        <Input id="oidc-issuer" name="issuer" type="url" defaultValue={issuer} placeholder="https://auth.example.com/realms/app" spellCheck={false} {...noFill} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="oidc-client" label="Client ID">
          <Input id="oidc-client" name="clientId" defaultValue={clientId} spellCheck={false} {...noFill} />
        </Field>
        <Field id="oidc-secret" label="Client secret" hint={hasSecret ? t("keepSecret") : undefined}>
          <Input id="oidc-secret" name="clientSecret" type="password" autoComplete="off" placeholder={hasSecret ? "••••••••" : ""} />
        </Field>
      </div>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[14px] font-semibold">{t("redirect")}</span>
          <CopyButton text={callback} />
        </div>
        <code className={codeBox}>{callback}</code>
        <p className={hint}>{t("roles")}</p>
      </div>
      <Feedback state={state} />
      <div><Submit pending={pending} pendingLabel={T("verifying")}>{t("save")}</Submit></div>
    </form>
  );
}

/* ---------- People ---------- */

type Role = "member" | "team" | "admin";

export function PersonActions({ slug, id, role, self, name }: { slug: string; id: string; role: string; self: boolean; name?: string }) {
  const t = useTranslations("integrations.people");
  const ROLES: Role[] = ["member", "team", "admin"];
  const [pending, start] = useTransition();
  if (self) return <span className="text-[13px] text-muted-foreground">{t("you")}</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select defaultValue={role} disabled={pending}
        onValueChange={(v) => {
          const r = v as Role;
          start(async () => { await setRole(slug, id, r); toast(`${name ?? t("role")}: ${t(`roles.${r}`)}`); });
        }}>
        <SelectTrigger size="sm" aria-label={`${t("role")}${name ? ` – ${name}` : ""}`} className="w-[130px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>)}
        </SelectContent>
      </Select>
      <ConfirmAction run={async () => { await signOutEverywhere(slug, id); toast(t("signedOut", { name: name ?? t("user") })); }}
        trigger={t("signOut")} variant="ghost" title={name ? t("signOutTitle", { name }) : t("signOutTitleUnnamed")} confirm={t("signOut")} pending={t("signingOut")}
        text={t("signOutText")} />
    </div>
  );
}

/* ---------- Custom domain ---------- */

export function DomainForm({ slug, domain, verified, target, allowed, token }: { slug: string; domain: string; verified: boolean; target: string; allowed: boolean; token: string }) {
  const T = useTranslations("integrations");
  const t = useTranslations("integrations.domain");
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => saveDomain(slug, p, f), {});
  const [check, setCheck] = useState<ActState>({});
  const [checking, start] = useTransition();
  const locked = !allowed && !domain;
  return (
    <form action={action} className={panel}>
      <Field id="dom" label={t("label")} hint={allowed ? t("none") : t("plan")}>
        <Input id="dom" name="domain" defaultValue={domain} placeholder={t("placeholder")} disabled={locked} spellCheck={false} {...noFill} className="max-w-md" />
      </Field>
      {domain && (verified ? (
        <p role="status" className="text-[14px]"><span className="font-semibold">{domain}</span> <span className="font-medium text-success">{t("verified")}</span></p>
      ) : (
        <div className="grid gap-3 rounded-lg border border-warn/40 bg-warn/10 p-4">
          <p className="text-[14px] font-semibold">{t("records")}</p>
          <dl className="grid gap-3 text-[13px]">
            {([["CNAME", domain, target], ["TXT", `_ozvi.${domain}`, token]] as const).map(([type, host, value]) => (
              <div key={type} className="grid gap-1">
                <dt className="font-semibold">{type} <span className="font-normal text-muted-foreground">{t("for")}</span> <code className="font-mono">{host}</code></dt>
                <dd className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <code className={cn(codeBox, "bg-surface")}>{value}</code>
                  <CopyButton text={value} />
                </dd>
              </div>
            ))}
          </dl>
          <p className={hint}>{t("afterDns")}</p>
        </div>
      ))}
      <Result error={check.error ?? state.error} ok={check.error || state.error ? undefined : (check.ok ?? state.ok)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || locked} aria-busy={pending || undefined}>{pending ? T("saving") : t("save")}</Button>
        {domain && !verified && (
          <Button type="button" variant="outline" disabled={checking} aria-busy={checking || undefined}
            onClick={() => start(async () => setCheck(await verifyDomain(slug)))}>
            {checking ? T("verifying") : t("verify")}
          </Button>
        )}
      </div>
    </form>
  );
}
