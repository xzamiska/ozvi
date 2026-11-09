"use client";

import { Plug, RefreshCw, X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActState } from "@/lib/integration-actions";
import { githubUnlink } from "@/lib/integration-actions";
import { disconnectTracker, rotateJiraSecret, saveJira, saveLinear, saveTrackerMapping, testTracker, trackerLink } from "@/lib/tracker-actions";
import { cn } from "@/lib/utils";
import { ChoiceLabel, codeBox, ConfirmAction, CopyButton, Field, hint, noFill, panel, Result, SecretBox } from "./settings";

/* Admin → Integrácie: Linear and Jira Cloud. Item page: TrackerBox. */

type Provider = "linear" | "jira";
type Bucket = "none" | "ack" | "progress" | "done" | "off";
const BUCKETS: Bucket[] = ["none", "ack", "progress", "done", "off"];
interface State { id: string; name: string; type: string }
export interface TrackerCommon {
  connected: boolean; viewer: string | null; states: State[]; mapping: Record<string, Bucket>;
  push: boolean; comments: "off" | "public" | "all";
}

function Feedback({ state }: { state: ActState }) {
  if (state.secret) return <SecretBox title={state.ok} secret={state.secret} />;
  return <Result error={state.error} ok={state.ok} />;
}

/** Connection state line: shape + text, never colour alone. */
function Status({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <p role="status" className="flex min-w-0 items-start gap-2 text-[14px]">
      <span aria-hidden className={cn("mt-[5px] size-2.5 shrink-0", on ? "rounded-full bg-st-done" : "rounded-[2px] border-2 border-line-strong")} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}

function Options({ id, push, comments }: { id: string; push: boolean; comments: TrackerCommon["comments"] }) {
  const t = useTranslations("integrations.tracker");
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[16px_1fr] items-start gap-2.5">
        <Checkbox id={`${id}-push`} name="push" defaultChecked={push} className="mt-0.5" />
        <ChoiceLabel htmlFor={`${id}-push`} title={t("push.title")} text={t("push.text")} />
      </div>
      <fieldset className="grid gap-2.5">
        <legend className="mb-2.5 text-[14px] font-semibold">{t("comments.legend")}</legend>
        <RadioGroup name="comments" defaultValue={comments} className="gap-2.5">
          {(["off", "public", "all"] as const).map((v) => (
            <div key={v} className="grid grid-cols-[16px_1fr] items-start gap-2.5">
              <RadioGroupItem id={`${id}-c-${v}`} value={v} className="mt-0.5" />
              <ChoiceLabel htmlFor={`${id}-c-${v}`} title={t(`comments.${v}.title`)} text={t(`comments.${v}.text`)} />
            </div>
          ))}
        </RadioGroup>
      </fieldset>
    </div>
  );
}

function HookUrl({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] font-semibold">{children}</span>
        <CopyButton text={url} />
      </div>
      <code className={codeBox}>{url}</code>
    </div>
  );
}

function Actions({ slug, provider, connected, pending, submit }: { slug: string; provider: Provider; connected: boolean; pending: boolean; submit: string }) {
  const T = useTranslations("integrations");
  const t = useTranslations("integrations.tracker");
  const [testing, start] = useTransition();
  const [test, setTest] = useState<ActState>({});
  const name = provider === "linear" ? "Linear" : "Jira";
  const acc = t(`acc.${provider}`);
  return (
    <div className="grid gap-3">
      <Result error={test.error} ok={test.ok} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending || undefined}>{pending ? T("verifying") : connected ? submit : <><Plug />{t("connect", { name: acc })}</>}</Button>
        {connected && (
          <Button type="button" variant="outline" disabled={testing} aria-busy={testing || undefined}
            onClick={() => start(async () => setTest(await testTracker(slug, provider)))}>
            <RefreshCw />{testing ? t("testing") : t("test")}
          </Button>
        )}
        {connected && (
          <ConfirmAction run={async () => { await disconnectTracker(slug, provider); toast(t("disconnected", { name })); }} trigger={t("disconnect")} variant="ghost" size="default"
            title={t("disconnectTitle", { name: acc })} text={t("disconnectText")} confirm={t("disconnectConfirm", { name: acc })} pending={t("disconnecting")} />
        )}
      </div>
    </div>
  );
}

/* ---------- Linear ---------- */

export function LinearForm({ slug, c, teams, teamId, teamName, webhookAuto, hasSecret, hookUrl, publicUrl }: {
  slug: string; c: TrackerCommon; teams: { id: string; key: string; name: string }[]; teamId: string | null; teamName: string | null;
  webhookAuto: boolean; hasSecret: boolean; hookUrl: string; publicUrl: boolean;
}) {
  const t = useTranslations("integrations.tracker");
  const tl = useTranslations("integrations.tracker.linear");
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => saveLinear(slug, p, f), {});
  return (
    <div className="grid gap-4">
      <form action={action} className={panel}>
        <Status on={c.connected && !!teamId}>
          {c.connected ? (teamId ? t("connectedTo", { who: c.viewer ?? "", where: teamName ?? "" }) : t("connectedNoTarget", { who: c.viewer ?? "" })) : t("notConnected")}
        </Status>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="lin-key" label={tl("key")} hint={c.connected ? t("keepSecret") : tl("keyHint")}>
            <Input id="lin-key" name="key" type="password" autoComplete="off" placeholder={c.connected ? "••••••••" : "lin_api_…"} required={!c.connected} />
          </Field>
          {c.connected && teams.length > 0 && (
            <Field id="lin-team" label={tl("team")} hint={tl("teamHint")}>
              <Select name="teamId" defaultValue={teamId ?? undefined}>
                <SelectTrigger id="lin-team" className="w-full"><SelectValue placeholder={tl("teamPick")} /></SelectTrigger>
                <SelectContent>
                  {teams.map((x) => <SelectItem key={x.id} value={x.id}>{x.name} <span className="text-muted-foreground">({x.key})</span></SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        {c.connected && teamId && <Options id="lin" push={c.push} comments={c.comments} />}
        {c.connected && teamId && (webhookAuto ? (
          <Status on>{tl("hookAuto")}</Status>
        ) : (
          <div className="grid gap-3 rounded-lg border border-dashed p-4">
            <HookUrl url={hookUrl}>{tl("hookManualTitle")}</HookUrl>
            <p className={hint}>{publicUrl ? tl("hookSteps") : tl("hookLocal")}</p>
            <Field id="lin-secret" label={tl("secret")} hint={hasSecret ? t("keepSecret") : tl("secretHint")}>
              <Input id="lin-secret" name="webhookSecret" type="password" autoComplete="off" placeholder={hasSecret ? "••••••••" : "lin_wh_…"} />
            </Field>
          </div>
        ))}
        <Feedback state={state} />
        <Actions slug={slug} provider="linear" connected={c.connected} pending={pending} submit={tl("save")} />
      </form>
      {c.connected && teamId && <MappingForm slug={slug} provider="linear" states={c.states} mapping={c.mapping} />}
    </div>
  );
}

/* ---------- Jira ---------- */

export function JiraForm({ slug, c, site, email, projects, projectKey, projectName, issueTypes, issueTypeId, sync, hookUrl, hasSecret }: {
  slug: string; c: TrackerCommon; site: string; email: string; projects: { key: string; name: string }[]; projectKey: string | null; projectName: string | null;
  issueTypes: { id: string; name: string }[]; issueTypeId: string | null; sync: "webhook" | "poll"; hookUrl: string; hasSecret: boolean;
}) {
  const t = useTranslations("integrations.tracker");
  const tj = useTranslations("integrations.tracker.jira");
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => saveJira(slug, p, f), {});
  const [rotated, setRotated] = useState<ActState>({});
  const [rotating, start] = useTransition();
  return (
    <div className="grid gap-4">
      <form action={action} className={panel}>
        <Status on={c.connected && !!projectKey}>
          {c.connected ? (projectKey ? t("connectedTo", { who: c.viewer ?? "", where: `${projectName ?? projectKey} (${projectKey})` }) : t("connectedNoTarget", { who: c.viewer ?? "" })) : t("notConnected")}
        </Status>
        <Field id="jira-site" label={tj("site")} hint={tj("siteHint")}>
          <Input id="jira-site" name="site" required defaultValue={site} placeholder="firma.atlassian.net" spellCheck={false} {...noFill} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="jira-email" label={tj("email")}>
            <Input id="jira-email" name="email" type="email" required defaultValue={email} spellCheck={false} {...noFill} />
          </Field>
          <Field id="jira-token" label={tj("token")} hint={c.connected ? t("keepSecret") : tj("tokenHint")}>
            <Input id="jira-token" name="token" type="password" autoComplete="off" placeholder={c.connected ? "••••••••" : "ATATT…"} required={!c.connected} />
          </Field>
        </div>
        {c.connected && projects.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="jira-project" label={tj("project")}>
              <Select name="projectKey" defaultValue={projectKey ?? undefined}>
                <SelectTrigger id="jira-project" className="w-full"><SelectValue placeholder={tj("projectPick")} /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.key} value={p.key}>{p.name} <span className="text-muted-foreground">({p.key})</span></SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {projectKey && issueTypes.length > 0 && (
              <Field id="jira-type" label={tj("issueType")} hint={tj("issueTypeHint")}>
                <Select name="issueTypeId" defaultValue={issueTypeId ?? undefined}>
                  <SelectTrigger id="jira-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{issueTypes.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>
        )}
        {c.connected && projectKey && <Options id="jira" push={c.push} comments={c.comments} />}
        {c.connected && projectKey && (
          <fieldset className="grid gap-2.5">
            <legend className="mb-2.5 text-[14px] font-semibold">{tj("syncLegend")}</legend>
            <RadioGroup name="sync" defaultValue={sync} className="gap-2.5">
              {(["webhook", "poll"] as const).map((v) => (
                <div key={v} className="grid grid-cols-[16px_1fr] items-start gap-2.5">
                  <RadioGroupItem id={`jira-sync-${v}`} value={v} className="mt-0.5" />
                  <ChoiceLabel htmlFor={`jira-sync-${v}`} title={tj(`sync.${v}.title`)} text={tj(`sync.${v}.text`)} />
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        )}
        {c.connected && projectKey && sync === "webhook" && (
          <div className="grid gap-3 rounded-lg border border-dashed p-4">
            <HookUrl url={hookUrl}>{tj("hookTitle")}</HookUrl>
            <p className={hint}>{tj("hookSteps", { key: projectKey })}</p>
            {hasSecret && (
              <div>
                <Button type="button" variant="outline" size="sm" disabled={rotating} aria-busy={rotating || undefined}
                  onClick={() => start(async () => setRotated(await rotateJiraSecret(slug)))}>{rotating ? t("testing") : tj("newSecret")}</Button>
              </div>
            )}
            <Feedback state={rotated} />
          </div>
        )}
        <Feedback state={state} />
        <Actions slug={slug} provider="jira" connected={c.connected} pending={pending} submit={tj("save")} />
      </form>
      {c.connected && projectKey && <MappingForm slug={slug} provider="jira" states={c.states} mapping={c.mapping} />}
    </div>
  );
}

/* ---------- state → stage mapping ---------- */

function MappingForm({ slug, provider, states, mapping }: { slug: string; provider: Provider; states: State[]; mapping: Record<string, Bucket> }) {
  const t = useTranslations("integrations.tracker");
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => saveTrackerMapping(slug, provider, p, f), {});
  if (states.length === 0) return <p className={cn(panel, hint)}>{t("noStates")}</p>;
  return (
    <form action={action} className={panel}>
      <div className="grid gap-1">
        <h4 className="text-[14px] font-semibold">{t("mapping.title")}</h4>
        <p className={hint}>{t("mapping.text")}</p>
      </div>
      <table className="w-full text-[14px]">
        <caption className="sr-only">{t("mapping.title")}</caption>
        <thead className="sr-only sm:not-sr-only">
          <tr className="text-left text-[12.5px] text-muted-foreground">
            <th scope="col" className="pb-2 font-medium">{t("mapping.state")}</th>
            <th scope="col" className="pb-2 font-medium">{t("mapping.stage")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {states.map((s) => (
            <tr key={s.id} className="grid gap-1.5 py-2.5 sm:table-row">
              <th scope="row" className="pr-4 text-left font-medium sm:py-2">
                <label htmlFor={`map-${provider}-${s.id}`}>{s.name}</label>
                {s.type && <span className="ml-2 font-mono text-[11.5px] font-normal text-muted-foreground">{s.type}</span>}
              </th>
              <td className="sm:w-[300px] sm:py-2">
                <Select name={`map:${s.id}`} defaultValue={mapping[s.id] ?? "none"}>
                  <SelectTrigger id={`map-${provider}-${s.id}`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{BUCKETS.map((b) => <SelectItem key={b} value={b}>{t(`bucket.${b}`)}</SelectItem>)}</SelectContent>
                </Select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={hint}>{t("mapping.push")}</p>
      <Result error={state.error} ok={state.ok} />
      <div><Button type="submit" variant="outline" disabled={pending} aria-busy={pending || undefined}>{pending ? t("saving") : t("mapping.save")}</Button></div>
    </form>
  );
}

/* ---------- item page ---------- */

export function TrackerBox({ slug, itemId, provider, links, enabled }: {
  slug: string; itemId: string; provider: Provider; enabled: boolean;
  links: { id: string; ref: string; url: string; title: string | null; state: string; stateName: string | null }[];
}) {
  const [state, action, pending] = useActionState((p: ActState, f: FormData) => trackerLink(slug, provider, itemId, p, f), {});
  const [unlinking, start] = useTransition();
  const t = useTranslations("forms.team");
  const tt = useTranslations("integrations.tracker");
  const name = provider === "linear" ? "Linear" : "Jira";
  return (
    <div className="grid gap-3">
      {links.length > 0 && (
        <ul className="grid gap-1.5">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-[13.5px]">
              <span className={cn("size-2 shrink-0", l.state === "closed" ? "rounded-full bg-st-done" : "rounded-[2px] bg-st-work")} aria-hidden />
              <a href={l.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{l.ref}</a>
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={l.title ?? undefined}>{l.stateName ? `${l.stateName} · ` : ""}{l.title}</span>
              <Button variant="ghost" size="icon-xs" aria-label={t("unlink", { ref: l.ref })} disabled={unlinking} className="size-6"
                onClick={() => start(async () => { await githubUnlink(slug, l.id); toast(t("unlinked", { ref: l.ref })); })}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {enabled && (
        <form action={action} className="grid gap-2">
          <Label htmlFor={`trk-${provider}`} className="sr-only">{tt("issueLabel", { name })}</Label>
          <Input id={`trk-${provider}`} name="issue" placeholder={provider === "linear" ? tt("linear.placeholder") : tt("jira.placeholder")} autoComplete="off" data-1p-ignore />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" name="create" value="0" disabled={pending} className="flex-1">{t("link")}</Button>
            <Button variant="outline" size="sm" name="create" value="1" disabled={pending} formNoValidate className="flex-1">{tt("create")}</Button>
          </div>
          {state.error && <p className="text-[13px] font-medium text-destructive" role="alert">{state.error}</p>}
          {state.ok && <p className="text-[13px] font-medium text-success" role="status">{state.ok}</p>}
        </form>
      )}
    </div>
  );
}
