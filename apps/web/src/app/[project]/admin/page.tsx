import { PLAN_LIMITS, schema, withProject, type PlanName, limitSize } from "@ozvi/db";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { Check, Download, TriangleAlert } from "lucide-react";
import { LockdownForm, SecretForm, SectionsForm, SettingsForm } from "@/components/AdminForms";
import { BlockToggle } from "@/components/Moderation";
import { DomainForm, GithubAppForm, GithubForm, OidcForm, PersonActions, RevokeToken, WebhookActions, WebhookForm } from "@/components/IntegrationForms";
import { allowedReposOf, installationOf, parseGithubConfig } from "@/lib/github";
import { githubApp, installationAccount, installationRepos } from "@/lib/github-app";
import { parseLinearConfig } from "@/lib/linear";
import { parseJiraConfig } from "@/lib/jira";
import { JiraForm, LinearForm } from "@/components/TrackerForms";
import { DeleteProjectForm } from "@/components/PrivacyForms";
import { cnameTarget, domainToken } from "@/lib/domains";
import { ago } from "@/lib/format";
import { ThemeEditor } from "@/components/ThemeEditor";
import { FaviconForm } from "@/components/FaviconForm";
import { appSite } from "@/lib/favicon";
import { Page, PageHead, Panel } from "@/components/ozvi/page";
import { hint, preBox, SettingsBlock, SettingsSection } from "@/components/settings-base";
import { SectionNav } from "@/components/settings";
import { UpdateNotice } from "@/components/ozvi/UpdateNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { projectOrigin, publicUrl } from "@/lib/email/url";
import { getCtx } from "@/lib/project";
import { LOCALE_TAG } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { LanguagesForm } from "@/components/AdminForms";
import { aiAvailable } from "@/lib/ai";
import { VotingForm } from "@/components/VotingForm";
import { ExportMenu } from "@/components/ExportMenu";
import { ImportPanel, ImportRuns } from "@/components/ImportPanel";
import { Gate } from "../_gate";
import { TagsAdmin } from "@/components/TagsAdmin";
import { StatusesAdmin, UnansweredForm } from "@/components/StatusesAdmin";
import { listTags, tagUsage } from "@/lib/tags";
import { listSubStatuses } from "@/lib/sub-statuses";
import { ALL_STAGES, parseStatusLabels } from "@/lib/statuses";
import { routeText } from "@/lib/route";
import { translator } from "@/i18n/messages";
import { boardLocales } from "@/i18n/board";
import { LOCALES, type Locale } from "@/i18n/locales";
import { boardTitle } from "@/lib/board-meta";
import { RetentionForm } from "@/components/RetentionForm";
import { policyOf, previewRetention } from "@/lib/retention";
import { PrivacyKit } from "@/components/PrivacyKit";
import { kitConfig } from "@/lib/privacy-kit-config";
import { LEGAL } from "@/lib/legal";
import { MESSAGES } from "@/i18n/messages";
import { enabledSections, homeSection } from "@/lib/sections";
import { translationsInPlan, translationsUsed } from "@/lib/translate";

export const generateMetadata = boardTitle("admin");

export default async function Admin({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ github?: string }> }) {
  const { project: slug } = await params;
  const { project, theme, user, locale } = await getCtx(slug);
  const t = await getTranslations({ locale, namespace: "admin" });
  if (user?.role !== "admin") {
    return <Gate project={project} locale={locale} signedIn={!!user} returnTo={`/${slug}/admin`} title={t("gate.title")}
      text={user ? t("gate.noRole") : t("gate.signIn")} />;
  }

  const [w] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, project.workspaceId));
  const plan = (w?.plan ?? "self") as PlanName;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const usage = await withProject(db, project.id, async (tx) => {
    const [e] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.emails)
      .where(and(inArray(schema.emails.status, ["sent", "digested"]), gte(schema.emails.sentAt, monthStart)));
    const [d] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.emails).where(eq(schema.emails.status, "deferred"));
    const [a] = await tx.select({ b: sql<number>`coalesce(sum(${schema.attachments.bytes}), 0)::bigint` }).from(schema.attachments);
    return { emails: e?.n ?? 0, deferred: d?.n ?? 0, bytes: Number(a?.b ?? 0) };
  });
  const extra = await withProject(db, project.id, async (tx) => {
    const { users, webhooks, webhookDeliveries, integrations, apiTokens } = schema;
    const people = await tx.select().from(users).orderBy(desc(users.createdAt)).limit(200);
    const hooks = await tx.select({
      hook: webhooks,
      failed: sql<number>`(select count(*)::int from ${webhookDeliveries} d where d.webhook_id = ${webhooks.id} and d.status = 'failed' and d.created_at > now() - interval '7 days')`,
      last: sql<string | null>`(select max(d.sent_at)::text from ${webhookDeliveries} d where d.webhook_id = ${webhooks.id})`,
    }).from(webhooks).orderBy(webhooks.createdAt);
    const github = await tx.query.integrations.findFirst({ where: eq(integrations.provider, "github") });
    const linearRow = await tx.query.integrations.findFirst({ where: eq(integrations.provider, "linear") });
    const jiraRow = await tx.query.integrations.findFirst({ where: eq(integrations.provider, "jira") });
    const tokens = await tx.select({ t: apiTokens, owner: users.name }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId))
      .where(isNull(apiTokens.revokedAt)).orderBy(desc(apiTokens.createdAt));
    const runs = await tx.select({ r: schema.importRuns, by: users.name, byEmail: users.email }).from(schema.importRuns)
      .leftJoin(users, eq(users.id, schema.importRuns.createdById)).orderBy(desc(schema.importRuns.createdAt)).limit(20);
    // Tags and custom statuses (admin sees team-only tags too).
    const tagList = await listTags(tx, true);
    const usage = Object.fromEntries(await tagUsage(tx));
    const subs = await listSubStatuses(tx);
    return { people, hooks, github, linearRow, jiraRow, tokens, runs, tagList, usage, subs };
  });
  const retentionPreview = await previewRetention(db, project.id, policyOf(project));
  const boardLangs = boardLocales(project);
  const editLocales = [boardLangs.fallback, ...boardLangs.allowed.filter((l) => l !== boardLangs.fallback)];
  const stopDefaults = Object.fromEntries(LOCALES.map((l) => [l, Object.fromEntries(ALL_STAGES.map((st) => [st, routeText(translator(l, "route"), "label", st)]))])) as Record<Locale, Record<string, string>>;
  const gh = parseGithubConfig(extra.github?.config);
  // GitHub App: the installation (also before a repository is picked) and what it may see.
  const ghApp = githubApp();
  const ghInstall = ghApp ? installationOf(extra.github?.config) : null;
  const [ghRepos, ghAccount] = ghApp && ghInstall
    ? await Promise.all([installationRepos(ghApp, ghInstall).then((rs) => rs.filter((r) => allowedReposOf(extra.github?.config).includes(r)), () => null), installationAccount(ghApp, ghInstall)])
    : [null, null];
  const ghParam = (await searchParams).github;
  const ghResult = (["connected", "failed", "requested"] as const).find((r) => r === ghParam) ?? null;
  const lin = parseLinearConfig(extra.linearRow?.config);
  const jir = parseJiraConfig(extra.jiraRow?.config);
  const team = extra.people.filter((p) => p.role !== "member");
  const members = extra.people.filter((p) => p.role === "member").slice(0, 30);
  const limits = PLAN_LIMITS[plan];
  const fmtLimit = (n: number, f: (n: number) => string) => (Number.isFinite(n) ? f(n) : t("limits.unlimited"));
  const tag = LOCALE_TAG[locale];
  const num = (n: number) => n.toLocaleString(tag);
  const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
  const base = projectOrigin(project);

  const mailOff = !process.env.SMTP_URL && !process.env.ECOMAIL_API_KEY;
  const kit = kitConfig({
    project, origin: base, aiOn: aiAvailable(plan), operator: LEGAL.operator, publicUrl: publicUrl(),
    integrations: {
      github: !!gh && (!!extra.github?.tokenEnc || !!gh.installationId), linear: !!extra.linearRow?.tokenEnc && !!lin, jira: !!extra.jiraRow?.tokenEnc && !!jir,
      hooks: extra.hooks.filter(({ hook }) => hook.active).map(({ hook }) => ({ format: hook.format, bugs: hook.includeBugs })),
    },
  });
  const kitMessages = Object.fromEntries(LOCALES.map((l) => [l, MESSAGES[l].privacyKit])) as Record<Locale, unknown>;
  const personName = (p: (typeof extra.people)[number]) => p.name ?? p.email ?? p.externalId;

  // First-run checklist: shown until somebody from the host app has signed in.
  const appUsers = members.length;
  const steps = [
    { done: !!project.ssoSecretEnc || !!project.oidcIssuer, href: "#sign-in", title: t("setup.sso.title"), text: t("setup.sso.text") },
    { done: project.allowedOrigins.length > 0, href: "#project", title: t("setup.origin.title"), text: t("setup.origin.text") },
    { done: appUsers > 0, href: "#sign-in", title: t("setup.widget.title"), text: t("setup.widget.text") },
  ];
  const setup = appUsers === 0;

  const nav = [
    ...(setup ? [{ id: "start", label: t("nav.start") }] : []),
    { id: "appearance", label: t("nav.look") },
    { id: "project", label: t("nav.project") },
    { id: "sections", label: t("nav.sections") },
    { id: "voting", label: t("nav.voting") },
    { id: "languages", label: t("nav.languages") },
    { id: "tags", label: t("nav.tags") },
    { id: "statuses", label: t("nav.statuses"), sub: t("nav.statusesSub") },
    { id: "sign-in", label: t("nav.login"), sub: t("nav.loginSub") },
    { id: "domain", label: t("nav.domain") },
    { id: "people", label: t("nav.people") },
    { id: "integrations", label: t("nav.integrations"), sub: t("nav.integrationsSub") },
    { id: "limits", label: t("nav.limits") },
    { id: "import", label: t("nav.import") },
    { id: "data", label: t("nav.data") },
  ];

  return (
    <Page>
      <PageHead title={t("title")} lede={t("lede", { name: project.name })} />

      <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
        <SectionNav items={nav} />

        <div className="grid min-w-0 gap-14">
          <UpdateNotice locale={locale} slug={slug} />

          {setup && (
            <SettingsSection id="start" title={t("nav.start")} text={t("setup.text")}>
              <ol className="grid gap-px overflow-hidden rounded-xl border bg-line">
                {steps.map((st, i) => (
                  <li key={st.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 bg-surface px-4 py-4 sm:px-5">
                    <span aria-hidden className={st.done
                      ? "grid size-7 place-items-center rounded-full bg-st-done text-white"
                      : "grid size-7 place-items-center rounded-full border-2 border-dashed border-line-strong font-heading text-[13px] font-bold text-muted-foreground"}>
                      {st.done ? <Check className="size-4" /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <a href={st.href} className="font-semibold hover:underline">{st.title}</a>
                      {st.done && <span className="ml-2 text-[13px] font-medium text-st-done">{t("setup.done")}</span>}
                      <p className="text-[14px] text-muted-foreground">{st.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </SettingsSection>
          )}

          <SettingsSection id="appearance" title={t("nav.look")} text={t("look.text")}>
            <ThemeEditor slug={slug} initial={theme} />
            <FaviconForm slug={slug} site={appSite(project) ?? ""} version={project.faviconKey?.split("/").pop() ?? "letter"} custom={!!project.faviconKey} />
          </SettingsSection>

          <SettingsSection id="project" title={t("nav.project")} text={t("project.text")}>
            <SettingsForm slug={slug} name={project.name} loginUrl={project.loginUrl ?? ""} origins={project.allowedOrigins} ideasPublic={project.ideasPublic} emailLogin={project.emailLogin} moderateIdeas={project.moderateIdeas} />
          </SettingsSection>

          <SettingsSection id="sections" title={t("nav.sections")} text={t("sections.text")}>
            <SectionsForm key={`${enabledSections(project).join()}:${homeSection(project)}`} slug={slug} sections={enabledSections(project)} home={homeSection(project)} />
          </SettingsSection>

          <SettingsSection id="voting" title={t("nav.voting")} text={t("voting.text")}>
            <VotingForm slug={slug} mode={project.voteMode === "importance" ? "importance" : "simple"} budget={project.voteBudget} />
          </SettingsSection>

          <SettingsSection id="languages" title={t("nav.languages")} text={t("languages.text")}>
            <LanguagesForm slug={slug} defaultLocale={project.defaultLocale} locales={project.locales}
              translationMode={project.translationMode} aiReady={translationsInPlan(plan)}
              allowance={Number.isFinite(PLAN_LIMITS[plan].translationsPerMonth) && translationsInPlan(plan) ? { used: await translationsUsed(db, project.workspaceId), limit: PLAN_LIMITS[plan].translationsPerMonth } : null} />
          </SettingsSection>

          <SettingsSection id="tags" title={t("nav.tags")} text={t("tags.text")}>
            <TagsAdmin slug={slug} tags={extra.tagList} usage={extra.usage} />
          </SettingsSection>

          <SettingsSection id="statuses" title={t("nav.statuses")} text={t("statuses.text")}>
            <StatusesAdmin slug={slug} locales={editLocales} labels={parseStatusLabels(project.statusLabels)} subs={extra.subs} defaults={stopDefaults} />
            <SettingsBlock id="unanswered" title={t("statuses.unansweredTitle")} text={t("statuses.unansweredText")}>
              <UnansweredForm slug={slug} days={project.unansweredDays} />
            </SettingsBlock>
          </SettingsSection>

          <SettingsSection id="sign-in" title={t("nav.login")} text={t("login.text")}>
            <SettingsBlock id="sso" title={t("login.ssoTitle")}>
              <Panel className="grid gap-5 p-5 sm:p-6">
                <SecretForm slug={slug} hasSecret={!!project.ssoSecretEnc} />
                <ol className="grid gap-5 border-t pt-5">
                  <li className="grid min-w-0 gap-2">
                    <p className="text-[14px]"><span className="font-semibold">{t("login.step1")}</span> <span className="text-muted-foreground">{t("login.step1Pkg")} <code className="font-mono text-[13px]">@ozvi/sdk</code> (MIT):</span></p>
                    <pre tabIndex={0} className={preBox}>{`import { signOzviToken } from "@ozvi/sdk";

app.get("/api/ozvi-token", requireLogin, (req, res) => {
  res.json({ token: signOzviToken(
    { id: req.user.id, email: req.user.email, name: req.user.name,
      role: req.user.isStaff ? "team" : "member",
      traits: { plan: req.org.plan } },
    process.env.OZVI_SSO_SECRET) });
});`}</pre>
                  </li>
                  <li className="grid min-w-0 gap-2">
                    <p className="text-[14px] font-semibold">{t("login.step2")}</p>
                    <pre tabIndex={0} className={preBox}>{`<script src="${base}/widget.js" defer></script>
<ozvi-widget project="${slug}" token-url="/api/ozvi-token" app-version="1.0.0"></ozvi-widget>`}</pre>
                    <p className={hint}>
                      {t("login.maskA")} <code className="font-mono">data-ozvi-mask</code>{t("login.maskB")} <code className="font-mono">launcher=&quot;none&quot;</code> {t("login.maskAnd")} <code className="font-mono">Ozvi.open(&quot;bug&quot;)</code>.
                    </p>
                  </li>
                </ol>
              </Panel>
            </SettingsBlock>
            <SettingsBlock id="oidc" title={t("login.oidcTitle")} text={t("login.oidcText")}>
              <OidcForm slug={slug} issuer={project.oidcIssuer ?? ""} clientId={project.oidcClientId ?? ""} hasSecret={!!project.oidcClientSecretEnc} callback={`${base}/${slug}/oidc/callback`} />
            </SettingsBlock>
          </SettingsSection>

          <SettingsSection id="domain" title={t("nav.domain")} text={t("domain.text")}>
            <DomainForm slug={slug} domain={project.customDomain ?? ""} verified={!!project.customDomainVerifiedAt} target={cnameTarget()} allowed={limits.customDomain} token={project.customDomain ? domainToken(project.id, project.customDomain) : ""} />
          </SettingsSection>

          <SettingsSection id="people" title={t("nav.people")} text={<>{t("people.textA")}<code className="font-mono text-[13px]">role</code>{t("people.textB")}</>}>
            <Panel as="ul" className="divide-y">
              {team.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-semibold">{personName(p)}</p>
                    {p.email && <p className="truncate text-[13px] text-muted-foreground">{p.email}</p>}
                  </div>
                  <PersonActions slug={slug} id={p.id} role={p.role} self={p.id === user.id} name={personName(p)} />
                </li>
              ))}
            </Panel>
            {members.length > 0 && (
              <details className="group rounded-xl border bg-surface">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] font-semibold sm:px-5">
                  {t("people.others")}
                  <span className="text-[13px] font-medium text-muted-foreground">{members.length}{extra.people.length >= 200 ? "+" : ""} {t("people.newest")} · <span className="group-open:hidden">{t("people.show")}</span><span className="hidden group-open:inline">{t("people.hide")}</span></span>
                </summary>
                <ul className="divide-y border-t">
                  {members.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-semibold">{personName(p)}</p>
                        <p className="truncate text-[13px] text-muted-foreground">{[p.email, t("people.since", { when: ago(p.createdAt, locale) })].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PersonActions slug={slug} id={p.id} role={p.role} self={false} name={personName(p)} />
                        <BlockToggle slug={slug} person={{ id: p.id, name: personName(p), blocked: !!p.blockedAt }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className={hint}>{t("people.note")}</p>
          </SettingsSection>

          <SettingsSection id="integrations" title={t("nav.integrations")} text={t("integrations.text")}>
            <SettingsBlock id="github" title="GitHub" text={t("integrations.githubText")}>
              {ghApp
                ? <GithubAppForm slug={slug} repo={gh?.repo ?? ""} onClose={gh?.onClose ?? "release"} repos={ghRepos} account={ghAccount} installed={!!ghInstall} result={ghResult} />
                : <GithubForm slug={slug} repo={gh?.repo ?? ""} onClose={gh?.onClose ?? "release"} connected={!!extra.github?.tokenEnc} hookUrl={`${base}/${slug}/api/github`} />}
            </SettingsBlock>

            <SettingsBlock id="linear" title="Linear" text={t("integrations.linearText")}>
              <LinearForm slug={slug} hookUrl={`${base}/${slug}/api/linear`} publicUrl={/^https:\/\//.test(base) && !/localhost/.test(base)}
                c={{ connected: !!extra.linearRow?.tokenEnc && !!lin, viewer: lin?.viewer ?? null, states: lin?.states ?? [], mapping: lin?.mapping ?? {}, push: lin?.push ?? true, comments: lin?.comments ?? "off" }}
                teams={lin?.teams ?? []} teamId={lin?.teamId ?? null} teamName={lin?.teamName ?? null} webhookAuto={!!lin?.webhookId} hasSecret={!!extra.linearRow?.webhookSecretEnc} />
            </SettingsBlock>

            <SettingsBlock id="jira" title="Jira Cloud" text={t("integrations.jiraText")}>
              <JiraForm slug={slug} hookUrl={`${base}/${slug}/api/jira`} hasSecret={!!extra.jiraRow?.webhookSecretEnc}
                c={{ connected: !!extra.jiraRow?.tokenEnc && !!jir, viewer: jir?.viewer ?? null, states: jir?.states ?? [], mapping: jir?.mapping ?? {}, push: jir?.push ?? true, comments: jir?.comments ?? "off" }}
                site={jir?.site.replace("https://", "") ?? ""} email={jir?.email ?? ""} projects={jir?.projects ?? []} projectKey={jir?.projectKey ?? null} projectName={jir?.projectName ?? null}
                issueTypes={jir?.issueTypes ?? []} issueTypeId={jir?.issueTypeId ?? null} sync={jir?.sync ?? "webhook"} />
            </SettingsBlock>

            <SettingsBlock id="webhooky" title={t("integrations.webhooks")} text={t("integrations.webhooksText")}>
              {extra.hooks.length > 0 && (
                <Panel as="ul" className="divide-y">
                  {extra.hooks.map(({ hook, failed, last }) => (
                    <li key={hook.id} className="grid gap-2 px-4 py-3 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[13.5px] font-semibold" title={hook.url}>{hook.url.replace(/^https?:\/\//, "")}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {hook.format === "slack" ? t("integrations.chat") : hook.format === "teams" ? "Microsoft Teams" : hook.format === "discord" ? "Discord" : "JSON"} · {hook.events.length ? t("integrations.events", { n: hook.events.length }) : t("integrations.allEvents")}
                          {hook.includeBugs ? ` · ${t("integrations.withBugs")}` : ""} · {last ? t("integrations.last", { when: ago(new Date(last), locale) }) : t("integrations.nothingYet")}
                          {failed > 0 && <span className="font-semibold text-destructive"> · {t("integrations.failed", { n: failed })}</span>}
                        </p>
                      </div>
                      <WebhookActions slug={slug} id={hook.id} />
                    </li>
                  ))}
                </Panel>
              )}
              <WebhookForm slug={slug} />
            </SettingsBlock>

            <SettingsBlock id="mcp" title={t("integrations.mcpTitle")} text={<>{t("integrations.mcpA")} <code className="font-mono text-[13px] break-all">{base}/{slug}/mcp</code>{t("integrations.mcpB")} <a href={`/${slug}/tokens`} className="oz-link">{t("integrations.myTokens")}</a>{t("integrations.mcpC")}</>}>
              {extra.tokens.length === 0 ? (
                <p className="rounded-xl border border-dashed bg-surface/60 px-5 py-6 text-center text-[14px] text-muted-foreground">{t("integrations.noTokens")}</p>
              ) : (
                <Panel as="ul" className="divide-y">
                  {extra.tokens.map(({ t: tk, owner }) => (
                    <li key={tk.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">{tk.name}<Badge variant="outline">{t(`scope.${tk.scope}`)}</Badge></p>
                        <p className="text-[13px] text-muted-foreground">
                          {owner} · <code className="font-mono">{tk.prefix}…</code> · {t("token.created", { when: ago(tk.createdAt, locale) })} · {tk.lastUsedAt ? t("token.used", { when: ago(tk.lastUsedAt, locale) }) : t("token.unused")}
                        </p>
                      </div>
                      <RevokeToken slug={slug} id={tk.id} name={tk.name} />
                    </li>
                  ))}
                </Panel>
              )}
              <LockdownForm slug={slug} on={project.mcpLockdown} />
              <p className="text-[13.5px] text-muted-foreground">
                {t("integrations.restA")} <code className="font-mono text-[13px] break-all">{base}/{slug}/api/v1</code>. <a href={`${publicUrl().replace(/\/$/, "")}/docs/api`} className="oz-link">{t("integrations.restDocs")}</a>
              </p>
            </SettingsBlock>
          </SettingsSection>

          <SettingsSection id="limits" title={t("nav.limits")} text={t("limits.text")}>
            {mailOff && (
              <div role="status" className="grid grid-cols-[16px_1fr] gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-[14px]">
                <TriangleAlert className="mt-0.5 size-4 text-warn" />
                <div className="grid gap-1">
                  <p className="font-semibold">{t("limits.mailOffTitle")}</p>
                  <p className="text-muted-foreground">{t("limits.mailOffA")} <code className="font-mono text-[13px]">SMTP_URL</code> {t("limits.mailOffB")} <code className="font-mono text-[13px]">ECOMAIL_API_KEY</code>{t("limits.mailOffC")} <code className="font-mono text-[13px]">OZVI_MAIL_FROM</code>.</p>
                </div>
              </div>
            )}
            <Panel>
              <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4 [&>div]:bg-surface [&>div]:px-4 [&>div]:py-4 sm:[&>div]:px-5">
                <div><dt className="text-[13px] text-muted-foreground">{t("limits.plan")}</dt><dd className="mt-1 font-heading text-[17px] font-bold capitalize">{plan}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">{t("limits.sent")}</dt><dd className="mt-1 font-heading text-[17px] font-bold tabular-nums">{num(usage.emails)} <span className="text-[13px] font-medium text-muted-foreground">/ {fmtLimit(limits.emailsPerMonth, num)}</span></dd></div>
                <div><dt className="text-[13px] text-muted-foreground">{t("limits.deferred")}</dt><dd className="mt-1 font-heading text-[17px] font-bold tabular-nums">{num(usage.deferred)}</dd></div>
                <div><dt className="text-[13px] text-muted-foreground">{t("limits.attachments")}</dt><dd className="mt-1 font-heading text-[17px] font-bold tabular-nums">{mb(usage.bytes)} <span className="text-[13px] font-medium text-muted-foreground">/ {fmtLimit(limits.attachmentBytes, limitSize)}</span></dd></div>
              </dl>
            </Panel>
          </SettingsSection>

          <SettingsSection id="import" title={t("nav.import")} text={t("import.text")}>
            <ImportPanel slug={slug} />
            <ImportRuns slug={slug} runs={extra.runs.map(({ r, by, byEmail }) => ({
              id: r.id, source: r.source, label: r.label, status: r.status, total: r.total, done: r.done, error: r.error,
              report: (r.report ?? {}) as Record<string, unknown>, createdAt: r.createdAt.toISOString(), by: by ?? byEmail,
            }))} />
          </SettingsSection>

          <SettingsSection id="data" title={t("nav.data")} text={t("data.text")}>
            <Panel as="ul" className="divide-y">
              <li className="grid gap-3 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="grid gap-0.5">
                  <p className="text-[14.5px] font-semibold">{t("data.csv")}</p>
                  <p className={hint}>{t("data.csvText")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ExportMenu slug={slug} kind="idea" query={{ f: "all" }} size="default" label={t("data.csvIdeas")} />
                  <ExportMenu slug={slug} kind="bug" query={{ s: "all" }} size="default" label={t("data.csvBugs")} />
                </div>
              </li>
              <li className="grid gap-3 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="grid gap-0.5">
                  <p className="text-[14.5px] font-semibold">{t("data.export")}</p>
                  <p className={hint}>{t("data.exportText")} {t("data.apiA")} <a href="#mcp" className="oz-link">{t("data.apiLink")}</a>{t("data.apiB")}</p>
                </div>
                <Button asChild variant="outline"><a href={`/${slug}/admin/export`} download><Download />{t("data.download")}</a></Button>
              </li>
            </Panel>
            <SettingsBlock id="retention" title={t("retention.title")} text={t("retention.text")}>
              <RetentionForm slug={slug} preview={retentionPreview}
                initial={{ capture: project.retentionCaptureDays, closedFiles: project.retentionClosedFilesDays, contacts: project.retentionContactsMonths }}
                lastRun={project.retentionRunAt ? ago(project.retentionRunAt, locale) : null} />
            </SettingsBlock>
            <SettingsBlock id="privacy-kit" title={t("privacyKit.title")} text={t("privacyKit.text")}>
              <PrivacyKit config={kit} messages={kitMessages} initialLocale={boardLangs.fallback} email={LEGAL.email}
                subprocessorsUrl={kit.mode === "cloud" ? kit.subprocessorsUrl : null} />
            </SettingsBlock>
            <div className="grid gap-4 rounded-xl border border-destructive/40 bg-surface p-5 sm:p-6">
              <div className="grid gap-0.5">
                <p className="text-[14.5px] font-semibold text-destructive">{t("data.delete")}</p>
                <p className={hint}>{t("data.deleteText")}</p>
              </div>
              <DeleteProjectForm slug={slug} />
            </div>
          </SettingsSection>
        </div>
      </div>
    </Page>
  );
}
