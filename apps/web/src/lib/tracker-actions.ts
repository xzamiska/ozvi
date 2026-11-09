"use server";

import { decryptSecret, encryptSecret, newSecret, schema, withProject, type Tx } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { logActivity, who } from "./activity";
import { db } from "./db";
import { DomainError, isTeamRole } from "./domain";
import { projectOrigin } from "./email/url";
import type { ActState } from "./integration-actions";
import {
  createJiraIssue, jiraProjectMeta, jiraViewer, linkJiraIssue, normalizeJiraSite, parseJiraConfig, type JiraConfig,
} from "./jira";
import {
  createLinearIssue, linearCreateWebhook, linearDeleteWebhook, linearStates, linearViewer, linkLinearIssue, parseLinearConfig, type LinearConfig,
} from "./linear";
import { getCtx } from "./project";
import { allow } from "./ratelimit";
import { cleanMapping, defaultMapping, type TrackerProvider, type TrackerState } from "./trackers";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function requireRole(slug: string, admin: boolean) {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "integrations.act" });
  if (admin ? ctx.user?.role !== "admin" : !ctx.user || !isTeamRole(ctx.user.role)) throw new Error(t(admin ? "adminOnly" : "teamOnly"));
  return { ...ctx, user: ctx.user!, t, tt: await getTranslations({ locale: ctx.locale, namespace: "integrations.tracker" }) };
}

const domain = async (locale: Locale, fn: () => Promise<ActState>): Promise<ActState> => {
  try { return await fn(); } catch (e) { if (e instanceof DomainError) return { error: e.text(locale) }; throw e; }
};

const isProvider = (p: string): p is TrackerProvider => p === "linear" || p === "jira";

/** Keep the admin's choices for states that still exist; new states get defaults. */
function remap(provider: TrackerProvider, states: TrackerState[], prev: Record<string, string> | undefined) {
  return cleanMapping(provider, { ...defaultMapping(provider, states), ...(prev ?? {}) }, states);
}

async function rowOf(tx: Tx, provider: TrackerProvider) {
  return tx.query.integrations.findFirst({ where: eq(schema.integrations.provider, provider) });
}

/** Linear can call us only on a public https address. */
const publicHook = (url: string) => /^https:\/\//.test(url) && !/^https:\/\/[^/]*localhost(?::\d+)?\//.test(url);

/* ---------- Linear ---------- */

export async function saveLinear(slug: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, locale, tt } = await requireRole(slug, true);
  if (!allow("tracker", project.id)) return { error: tt("slowDown") };
  const key = str(form, "key");
  const teamId = str(form, "teamId");
  const manualSecret = str(form, "webhookSecret");
  const hookUrl = `${projectOrigin(project)}/${project.slug}/api/linear`;
  return domain(locale, () => withProject(db, project.id, async (tx) => {
    const row = await rowOf(tx, "linear");
    const prev = parseLinearConfig(row?.config) ?? null;
    const token = key || (row?.tokenEnc ? decryptSecret(row.tokenEnc) : "");
    if (!token) return { error: tt("linear.needKey") };
    const who_ = key || !prev?.viewer ? await linearViewer(token) : { viewer: prev.viewer, teams: prev.teams };
    const pick = teamId || prev?.teamId || (who_.teams.length === 1 ? who_.teams[0]!.id : "");
    const team = who_.teams.find((t) => t.id === pick) ?? null;
    if (pick && !team) return { error: tt("linear.noTeam") };
    const teamChanged = !!team && team.id !== prev?.teamId;
    const states = team ? (teamChanged || !prev?.states.length ? await linearStates(token, team.id) : prev.states) : [];
    let webhookId = teamChanged ? null : prev?.webhookId ?? null;
    let secret = row?.webhookSecretEnc && !teamChanged ? decryptSecret(row.webhookSecretEnc) : null;
    if (teamChanged && prev?.webhookId) await linearDeleteWebhook(token, prev.webhookId).catch(() => undefined);
    let hookNote: string | null = null;
    if (team && !webhookId && !manualSecret && publicHook(hookUrl)) {
      const s = newSecret();
      try {
        webhookId = await linearCreateWebhook(token, team.id, hookUrl, s);
        secret = s;
      } catch { hookNote = tt("linear.hookManual"); }
    }
    if (manualSecret) secret = manualSecret;
    const config: LinearConfig = {
      states, mapping: remap("linear", states, teamChanged ? undefined : prev?.mapping),
      push: form.has("comments") ? form.get("push") === "on" : prev?.push ?? true,
      comments: (["off", "public", "all"] as const).find((c) => c === str(form, "comments")) ?? prev?.comments ?? "off",
      teamId: team?.id ?? null, teamKey: team?.key ?? null, teamName: team?.name ?? null, teams: who_.teams, viewer: who_.viewer, webhookId,
    };
    const values = { config, tokenEnc: encryptSecret(token), webhookSecretEnc: secret ? encryptSecret(secret) : null };
    if (row) await tx.update(schema.integrations).set(values).where(eq(schema.integrations.id, row.id));
    else await tx.insert(schema.integrations).values({ projectId: project.id, provider: "linear", ...values });
    if (!row) await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "linear.connected", detail: who_.viewer });
    revalidatePath(`/${slug}`, "layout");
    if (!team) return { ok: tt("linear.pickTeamNow") };
    return { ok: hookNote ?? (webhookId && teamChanged ? tt("linear.hookCreated", { team: team.name }) : tt("saved")) };
  }));
}

/* ---------- Jira ---------- */

export async function saveJira(slug: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, locale, tt } = await requireRole(slug, true);
  if (!allow("tracker", project.id)) return { error: tt("slowDown") };
  const site = normalizeJiraSite(str(form, "site"));
  const email = str(form, "email");
  const tokenIn = str(form, "token");
  if (!site) return { error: tt("jira.siteFormat") };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: tt("jira.emailFormat") };
  return domain(locale, () => withProject(db, project.id, async (tx) => {
    const row = await rowOf(tx, "jira");
    const prev = parseJiraConfig(row?.config) ?? null;
    const sameAccount = prev && prev.site === site && prev.email === email;
    const token = tokenIn || (sameAccount && row?.tokenEnc ? decryptSecret(row.tokenEnc) : "");
    if (!token) return { error: tt("jira.needToken") };
    const a = { site, email, token };
    const me = tokenIn || !sameAccount || !prev?.viewer ? await jiraViewer(a) : { viewer: prev.viewer, projects: prev.projects };
    const pick = str(form, "projectKey") || (sameAccount ? prev?.projectKey : "") || (me.projects.length === 1 ? me.projects[0]!.key : "");
    const proj = me.projects.find((p) => p.key === pick) ?? null;
    if (pick && !proj) return { error: tt("jira.noProject") };
    const projChanged = !!proj && proj.key !== prev?.projectKey;
    const meta = proj ? (projChanged || !prev?.states.length ? await jiraProjectMeta(a, proj.key) : { name: prev.projectName ?? proj.name, issueTypes: prev.issueTypes, states: prev.states }) : null;
    const typeIn = str(form, "issueTypeId");
    const issueTypeId = meta ? (meta.issueTypes.find((t) => t.id === typeIn)?.id ?? (projChanged ? null : prev?.issueTypeId) ?? meta.issueTypes[0]?.id ?? null) : null;
    const fresh = !row?.webhookSecretEnc;
    const secret = fresh ? newSecret() : null;
    const config: JiraConfig = {
      states: meta?.states ?? [], mapping: remap("jira", meta?.states ?? [], projChanged ? undefined : prev?.mapping),
      push: form.has("comments") ? form.get("push") === "on" : prev?.push ?? true,
      comments: (["off", "public", "all"] as const).find((c) => c === str(form, "comments")) ?? prev?.comments ?? "off",
      site, email, projectKey: proj?.key ?? null, projectName: meta?.name ?? null, issueTypeId,
      projects: me.projects, issueTypes: meta?.issueTypes ?? [], viewer: me.viewer,
      sync: str(form, "sync") === "poll" ? "poll" : str(form, "sync") === "webhook" ? "webhook" : prev?.sync ?? "webhook",
      lastPollAt: prev?.lastPollAt ?? null,
    };
    const values = { config, tokenEnc: encryptSecret(token), ...(secret ? { webhookSecretEnc: encryptSecret(secret) } : {}) };
    if (row) await tx.update(schema.integrations).set(values).where(eq(schema.integrations.id, row.id));
    else await tx.insert(schema.integrations).values({ projectId: project.id, provider: "jira", ...values });
    if (!row) await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: "jira.connected", detail: site.replace("https://", "") });
    revalidatePath(`/${slug}`, "layout");
    if (secret) return { ok: tt("jira.secretOnce"), secret };
    return { ok: proj ? tt("saved") : tt("jira.pickProjectNow") };
  }));
}

/* ---------- shared: mapping, test, disconnect ---------- */

export async function saveTrackerMapping(slug: string, provider: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, tt } = await requireRole(slug, true);
  if (!isProvider(provider)) return { error: tt("unknown") };
  return withProject(db, project.id, async (tx) => {
    const row = await rowOf(tx, provider);
    const cfg = provider === "linear" ? parseLinearConfig(row?.config) : parseJiraConfig(row?.config);
    if (!row || !cfg) return { error: tt("notConnected") };
    const raw = Object.fromEntries(cfg.states.map((s) => [s.id, str(form, `map:${s.id}`)]));
    const mapping = cleanMapping(provider, raw, cfg.states);
    await tx.update(schema.integrations).set({ config: { ...(row.config as object), mapping } }).where(eq(schema.integrations.id, row.id));
    await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: `${provider}.mapping`, detail: null });
    revalidatePath(`/${slug}/admin`);
    return { ok: tt("mappingSaved") };
  });
}

/** Checks the credentials and refreshes the workflow states (mapping kept where states still exist). */
export async function testTracker(slug: string, provider: string): Promise<ActState> {
  const { project, locale, tt } = await requireRole(slug, true);
  if (!isProvider(provider)) return { error: tt("unknown") };
  if (!allow("tracker", project.id)) return { error: tt("slowDown") };
  return domain(locale, () => withProject(db, project.id, async (tx) => {
    const row = await rowOf(tx, provider);
    if (!row?.tokenEnc) return { error: tt("notConnected") };
    const token = decryptSecret(row.tokenEnc);
    if (provider === "linear") {
      const cfg = parseLinearConfig(row.config);
      if (!cfg) return { error: tt("notConnected") };
      const me = await linearViewer(token);
      const states = cfg.teamId ? await linearStates(token, cfg.teamId) : [];
      await tx.update(schema.integrations).set({ config: { ...cfg, viewer: me.viewer, teams: me.teams, states, mapping: remap("linear", states, cfg.mapping) } }).where(eq(schema.integrations.id, row.id));
      revalidatePath(`/${slug}/admin`);
      return { ok: tt("testOk", { who: me.viewer, n: states.length }) };
    }
    const cfg = parseJiraConfig(row.config);
    if (!cfg) return { error: tt("notConnected") };
    const a = { site: cfg.site, email: cfg.email, token };
    const me = await jiraViewer(a);
    const meta = cfg.projectKey ? await jiraProjectMeta(a, cfg.projectKey) : null;
    const states = meta?.states ?? [];
    await tx.update(schema.integrations).set({ config: { ...cfg, viewer: me.viewer, projects: me.projects, states, issueTypes: meta?.issueTypes ?? cfg.issueTypes, mapping: remap("jira", states, cfg.mapping) } }).where(eq(schema.integrations.id, row.id));
    revalidatePath(`/${slug}/admin`);
    return { ok: tt("testOk", { who: me.viewer, n: states.length }) };
  }));
}

/** New Jira webhook secret (shown once), e.g. after losing it. */
export async function rotateJiraSecret(slug: string): Promise<ActState> {
  const { project, tt } = await requireRole(slug, true);
  const secret = newSecret();
  const [r] = await withProject(db, project.id, (tx) => tx.update(schema.integrations).set({ webhookSecretEnc: encryptSecret(secret) })
    .where(eq(schema.integrations.provider, "jira")).returning({ id: schema.integrations.id }));
  if (!r) return { error: tt("notConnected") };
  return { ok: tt("jira.secretOnce"), secret };
}

export async function disconnectTracker(slug: string, provider: string) {
  const { project, user } = await requireRole(slug, true);
  if (!isProvider(provider)) return;
  await withProject(db, project.id, async (tx) => {
    const row = await rowOf(tx, provider);
    if (!row) return;
    const cfg = provider === "linear" ? parseLinearConfig(row.config) : null;
    // Best effort: a webhook we created should not keep calling a disconnected project.
    if (cfg?.webhookId && row.tokenEnc) await linearDeleteWebhook(decryptSecret(row.tokenEnc), cfg.webhookId).catch(() => undefined);
    await tx.delete(schema.integrations).where(eq(schema.integrations.id, row.id));
  });
  await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action: `${provider}.disconnected`, detail: null });
  revalidatePath(`/${slug}`, "layout");
}

/* ---------- item page (team) ---------- */

export async function trackerLink(slug: string, provider: string, itemId: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, t, locale } = await requireRole(slug, false);
  if (!isProvider(provider)) return { error: t("noItem") };
  if (!allow("tracker", `u:${user.id}`)) return { error: (await getTranslations({ locale, namespace: "integrations.tracker" }))("slowDown") };
  const create = form.get("create") === "1";
  return domain(locale, async () => {
    const link = await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(schema.items.id, itemId) });
      if (!item) throw new DomainError(t("noItem"));
      if (provider === "linear") return create ? createLinearIssue(tx, project, user, item) : linkLinearIssue(tx, project, user, item, str(form, "issue"));
      return create ? createJiraIssue(tx, project, user, item) : linkJiraIssue(tx, project, user, item, str(form, "issue"));
    });
    revalidatePath(`/${slug}`, "layout");
    return { ok: t("linked", { ref: link.ref }) };
  });
}
