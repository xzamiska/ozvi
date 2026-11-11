"use server";

import type { Locale } from "@/i18n/locales";
import { encryptSecret, newSecret, PLAN_LIMITS, schema, withProject, type PlanName } from "@ozvi/db";
import { dnsPointsHere, forgetHost, normalizeDomain, ownsDomain } from "./domains";
import type { Scope } from "@ozvi/mcp";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logActivity, who } from "./activity";
import { db } from "./db";
import { DomainError, isTeamRole } from "./domain";
import { EVENTS } from "./events";
import { createIssue, gh, installationOf, linkIssue, parseGithubConfig } from "./github";
import { githubApp, installationRepos, installState, installUrl, readInstallTicket } from "./github-app";
import { discoverOidc } from "./oidc";
import { getTranslations } from "next-intl/server";
import { getCtx } from "./project";
import { newToken } from "./tokens";
import { checkTarget, deliver } from "./webhooks";

export interface ActState { ok?: string; error?: string; secret?: string }

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function requireTeam(slug: string) {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "integrations.act" });
  if (!ctx.user || !isTeamRole(ctx.user.role)) throw new Error(t("teamOnly"));
  return { ...ctx, user: ctx.user, t };
}
async function requireAdmin(slug: string) {
  const ctx = await getCtx(slug);
  const t = await getTranslations({ locale: ctx.locale, namespace: "integrations.act" });
  if (ctx.user?.role !== "admin") throw new Error(t("adminOnly"));
  return { ...ctx, user: ctx.user, t };
}
const log = (project: { id: string; workspaceId: string }, user: { name: string | null; email: string | null }, action: Parameters<typeof logActivity>[0]["action"], detail?: string) =>
  logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(user), action, detail });

const domain = async (locale: Locale, fn: () => Promise<ActState>): Promise<ActState> => {
  try { return await fn(); } catch (e) { if (e instanceof DomainError) return { error: e.text(locale) }; throw e; }
};

/* ---------- API tokens (team: own tokens) ---------- */

const SCOPES: Scope[] = ["read", "write", "triage"];

export async function createToken(slug: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, t } = await requireTeam(slug);
  const name = str(form, "name");
  const scope = str(form, "scope") as Scope;
  const days = Number(str(form, "days"));
  if (name.length < 2 || name.length > 60) return { error: t("tokenName") };
  if (!SCOPES.includes(scope)) return { error: t("pickScope") };
  const count = await withProject(db, project.id, async (tx) => {
    const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.apiTokens)
      .where(and(eq(schema.apiTokens.userId, user.id), sql`${schema.apiTokens.revokedAt} is null`));
    return r?.n ?? 0;
  });
  if (count >= 20) return { error: t("tooMany") };
  const tok = newToken(project.slug);
  await withProject(db, project.id, (tx) => tx.insert(schema.apiTokens).values({
    projectId: project.id, userId: user.id, name, hash: tok.hash, prefix: tok.prefix, scope,
    expiresAt: days > 0 ? new Date(Date.now() + days * 86_400_000) : null,
  }));
  await log(project, user, "token.created", `${name} (${scope})`);
  revalidatePath(`/${slug}/tokens`);
  return { ok: t("tokenCreated", { name }), secret: tok.token };
}

export async function revokeToken(slug: string, id: string) {
  const { project, user } = await requireTeam(slug);
  const [gone] = await withProject(db, project.id, (tx) => tx.update(schema.apiTokens).set({ revokedAt: new Date() })
    .where(and(eq(schema.apiTokens.id, id), ...(user.role === "admin" ? [] : [eq(schema.apiTokens.userId, user.id)]))).returning({ name: schema.apiTokens.name }));
  if (gone) await log(project, user, "token.revoked", gone.name);
  revalidatePath(`/${slug}/tokens`);
  revalidatePath(`/${slug}/admin`);
}

/* ---------- Webhooks (admin) ---------- */

export async function addWebhook(slug: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, t } = await requireAdmin(slug);
  const url = str(form, "url");
  const picked = str(form, "format");
  const format = (["slack", "teams", "discord"] as const).find((f) => f === picked) ?? "json";
  const events = form.getAll("events").map(String).filter((e) => (EVENTS as readonly string[]).includes(e));
  const bad = await checkTarget(url);
  if (bad) return { error: bad };
  const secret = newSecret();
  await withProject(db, project.id, (tx) => tx.insert(schema.webhooks).values({
    projectId: project.id, url, format, events, includeBugs: form.get("includeBugs") === "on", secretEnc: encryptSecret(secret),
  }));
  await log(project, user, "webhook.added", new URL(url).host);
  revalidatePath(`/${slug}/admin`);
  return format === "json"
    ? { ok: t("hookAddedSigned"), secret }
    : { ok: t("hookAdded") };
}

export async function deleteWebhook(slug: string, id: string) {
  const { project, user } = await requireAdmin(slug);
  const [gone] = await withProject(db, project.id, (tx) => tx.delete(schema.webhooks).where(eq(schema.webhooks.id, id)).returning({ url: schema.webhooks.url }));
  if (gone) await log(project, user, "webhook.deleted", new URL(gone.url).host);
  revalidatePath(`/${slug}/admin`);
}

export async function testWebhook(slug: string, id: string): Promise<ActState> {
  const { project, t, locale } = await requireAdmin(slug);
  const hook = await withProject(db, project.id, (tx) => tx.query.webhooks.findFirst({ where: eq(schema.webhooks.id, id) }));
  if (!hook) return { error: t("noHook") };
  const r = await deliver(hook, {
    event: "item.created", project: { slug: project.slug, name: project.name }, actor: { name: "Ozvi test" },
    item: { number: 0, kind: "idea", title: t("testTitle"), body: "", status: "open", fixedInVersion: null, votes: 0, url: `${process.env.PUBLIC_URL ?? ""}/${slug}/ideas`, createdAt: new Date().toISOString() },
    at: new Date().toISOString(), test: true,
  }, undefined, undefined, locale);
  return r.ok ? { ok: t("delivered", { code: String(r.code) }) } : { error: t("failed", { err: r.error ?? "" }) };
}

/* ---------- GitHub (admin) ---------- */

export async function saveGithub(slug: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, t, locale } = await requireAdmin(slug);
  return domain(locale, async () => withProject(db, project.id, async (tx) => {
    const existing = await tx.query.integrations.findFirst({ where: eq(schema.integrations.provider, "github") });
    const installationId = installationOf(existing?.config);
    const app = githubApp();
    // Through the GitHub App: the repository must be one the admin gave the app on GitHub.
    if (installationId && app) {
      const config = parseGithubConfig({ repo: str(form, "repo"), onClose: str(form, "onClose"), installationId });
      if (!config) return { error: t("ghPickRepo") };
      const repos = await installationRepos(app, installationId).catch(() => null);
      if (!repos) return { error: t("ghAppUnreachable") };
      if (!repos.includes(config.repo)) return { error: t("ghNotGranted", { repo: config.repo }) };
      await tx.update(schema.integrations).set({ config }).where(eq(schema.integrations.id, existing!.id));
      await log(project, user, "github.connected", config.repo);
      revalidatePath(`/${slug}`, "layout");
      return { ok: t("ghAppConnected", { repo: config.repo }) };
    }
    const config = parseGithubConfig({ repo: str(form, "repo"), onClose: str(form, "onClose") });
    if (!config) return { error: t("repoFormat") };
    const token = str(form, "token");
    if (!token && !existing?.tokenEnc) return { error: t("needToken") };
    if (token) await gh(token, `/repos/${config.repo}`);
    const secret = existing?.webhookSecretEnc ? null : newSecret();
    const values = {
      config, ...(token && { tokenEnc: encryptSecret(token) }), ...(secret && { webhookSecretEnc: encryptSecret(secret) }),
    };
    if (existing) await tx.update(schema.integrations).set(values).where(eq(schema.integrations.id, existing.id));
    else await tx.insert(schema.integrations).values({ projectId: project.id, provider: "github", ...values });
    await log(project, user, "github.connected", config.repo);
    revalidatePath(`/${slug}`, "layout");
    return secret
      ? { ok: t("ghConnected", { repo: config.repo }), secret }
      : { ok: t("ghSaved") };
  }));
}

/** GitHub App: off to GitHub to install the app (or change which repositories it may see). */
export async function startGithubInstall(slug: string) {
  const { project, user } = await requireAdmin(slug);
  const app = githubApp();
  if (!app) throw new Error("GitHub App is not configured");
  redirect(installUrl(app, installState({ p: project.id, u: user.id, s: slug })));
}

/** GitHub App, back from GitHub (via /api/github/callback): store the installation under the admin's session. */
export async function finishGithubInstall(slug: string, ticket: string): Promise<"ok" | "invalid"> {
  const { project, user } = await requireAdmin(slug);
  const tk = readInstallTicket(ticket);
  if (!tk || tk.p !== project.id || tk.u !== user.id) return "invalid";
  await withProject(db, project.id, async (tx) => {
    const existing = await tx.query.integrations.findFirst({ where: eq(schema.integrations.provider, "github") });
    const prev = parseGithubConfig(existing?.config);
    // A repository picked before stays if the same installation still covers it (checked on save).
    const config = { ...(prev && prev.installationId === tk.i ? { repo: prev.repo, onClose: prev.onClose } : {}), installationId: tk.i };
    if (existing) await tx.update(schema.integrations).set({ config, tokenEnc: null, webhookSecretEnc: null }).where(eq(schema.integrations.id, existing.id));
    else await tx.insert(schema.integrations).values({ projectId: project.id, provider: "github", config });
  });
  await db.update(schema.projects).set({ githubInstallationId: tk.i }).where(eq(schema.projects.id, project.id));
  await log(project, user, "github.connected", `app:${tk.i}`);
  revalidatePath(`/${slug}`, "layout");
  return "ok";
}

export async function disconnectGithub(slug: string) {
  const { project, user } = await requireAdmin(slug);
  await withProject(db, project.id, (tx) => tx.delete(schema.integrations).where(eq(schema.integrations.provider, "github")));
  await db.update(schema.projects).set({ githubInstallationId: null }).where(eq(schema.projects.id, project.id));
  await log(project, user, "github.disconnected");
  revalidatePath(`/${slug}`, "layout");
}

/** Team, from the item page: link an existing issue or open a new one. */
export async function githubLink(slug: string, itemId: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, t, locale } = await requireTeam(slug);
  const create = form.get("create") === "1";
  return domain(locale, async () => {
    const link = await withProject(db, project.id, async (tx) => {
      const item = await tx.query.items.findFirst({ where: eq(schema.items.id, itemId) });
      if (!item) throw new DomainError(t("noItem"));
      return create ? createIssue(tx, project, user, item) : linkIssue(tx, project, user, item, str(form, "issue"));
    });
    revalidatePath(`/${slug}`, "layout");
    return { ok: t("linked", { ref: link.ref }) };
  });
}

export async function githubUnlink(slug: string, linkId: string) {
  const { project } = await requireTeam(slug);
  await withProject(db, project.id, (tx) => tx.delete(schema.itemLinks).where(eq(schema.itemLinks.id, linkId)));
  revalidatePath(`/${slug}`, "layout");
}

/* ---------- OIDC (admin) ---------- */

export async function saveOidc(slug: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, t } = await requireAdmin(slug);
  const issuer = str(form, "issuer").replace(/\/$/, "");
  const clientId = str(form, "clientId");
  const clientSecret = str(form, "clientSecret");
  if (!issuer) {
    await db.update(schema.projects).set({ oidcIssuer: null, oidcClientId: null, oidcClientSecretEnc: null }).where(eq(schema.projects.id, project.id));
    await log(project, user, "project.oidc", "off");
    revalidatePath(`/${slug}`, "layout");
    return { ok: t("oidcOff") };
  }
  if (!/^https:\/\//.test(issuer) && process.env.OZVI_MODE === "cloud") return { error: t("httpsIssuer") };
  if (!clientId) return { error: t("clientId") };
  if (!clientSecret && !project.oidcClientSecretEnc) return { error: t("clientSecret") };
  try {
    await discoverOidc(issuer);
  } catch (e) {
    return { error: t("discovery", { issuer, err: e instanceof Error ? e.message : String(e) }) };
  }
  await db.update(schema.projects).set({
    oidcIssuer: issuer, oidcClientId: clientId, ...(clientSecret && { oidcClientSecretEnc: encryptSecret(clientSecret) }),
  }).where(eq(schema.projects.id, project.id));
  await log(project, user, "project.oidc", issuer);
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("oidcSaved") };
}

/* ---------- People (admin) ---------- */

export async function signOutEverywhere(slug: string, userId: string) {
  const { project, user } = await requireAdmin(slug);
  const target = await withProject(db, project.id, async (tx) => {
    await tx.update(schema.users).set({ sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.id, userId));
    await tx.update(schema.apiTokens).set({ revokedAt: new Date() }).where(and(eq(schema.apiTokens.userId, userId), sql`${schema.apiTokens.revokedAt} is null`));
    return tx.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { name: true, email: true } });
  });
  await log(project, user, "board.signout", who(target ?? null) ?? undefined);
  revalidatePath(`/${slug}/admin`);
}

export async function setRole(slug: string, userId: string, role: "member" | "team" | "admin") {
  const { project, user, t } = await requireAdmin(slug);
  if (userId === user.id) throw new Error(t("ownRole"));
  if (!["member", "team", "admin"].includes(role)) throw new Error(t("badRole"));
  const [target] = await withProject(db, project.id, (tx) => tx.update(schema.users)
    .set({ role, sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.id, userId)).returning({ name: schema.users.name, email: schema.users.email }));
  await log(project, user, "board.role", `${who(target ?? null) ?? "?"} → ${role}`);
  revalidatePath(`/${slug}/admin`);
}

/* ---------- Custom domain (admin) ---------- */

async function planOf(workspaceId: string): Promise<PlanName> {
  const [w] = await db.select({ plan: schema.workspaces.plan }).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
  return (w?.plan ?? "self") as PlanName;
}

export async function saveDomain(slug: string, _: ActState, form: FormData): Promise<ActState> {
  const { project, user, t } = await requireAdmin(slug);
  const raw = str(form, "domain");
  if (!raw) {
    await db.update(schema.projects).set({ customDomain: null, customDomainVerifiedAt: null }).where(eq(schema.projects.id, project.id));
    if (project.customDomain) forgetHost(project.customDomain);
    await log(project, user, "project.domain", "removed");
    revalidatePath(`/${slug}`, "layout");
    return { ok: t("domainRemoved") };
  }
  if (!PLAN_LIMITS[await planOf(project.workspaceId)].customDomain) return { error: t("domainPlan") };
  const domain = normalizeDomain(raw);
  if (!domain) return { error: t("domainFormat") };
  // Only a verified claim blocks others; unverified ones are just someone's intention.
  const taken = await db.query.projects.findFirst({ where: and(eq(schema.projects.customDomain, domain), isNotNull(schema.projects.customDomainVerifiedAt)), columns: { id: true } });
  if (taken && taken.id !== project.id) return { error: t("domainTaken") };
  const verified = (await dnsPointsHere(domain)) && (await ownsDomain(project.id, domain));
  await db.update(schema.projects).set({ customDomain: domain, customDomainVerifiedAt: verified ? new Date() : null }).where(eq(schema.projects.id, project.id));
  forgetHost(domain);
  await log(project, user, verified ? "project.domain_verified" : "project.domain", domain);
  revalidatePath(`/${slug}`, "layout");
  return verified
    ? { ok: t("domainVerifiedCert", { d: domain }) }
    : { ok: t("domainSaved", { d: domain }) };
}

export async function verifyDomain(slug: string): Promise<ActState> {
  const { project, user, t } = await requireAdmin(slug);
  if (!project.customDomain) return { error: t("domainFirst") };
  if (!(await dnsPointsHere(project.customDomain))) {
    return { error: t("noCname", { d: project.customDomain }) };
  }
  if (!(await ownsDomain(project.id, project.customDomain))) {
    return { error: t("noTxt", { d: project.customDomain }) };
  }
  const taken = await db.query.projects.findFirst({ where: and(eq(schema.projects.customDomain, project.customDomain), isNotNull(schema.projects.customDomainVerifiedAt)), columns: { id: true } });
  if (taken && taken.id !== project.id) return { error: t("domainTaken") };
  await db.update(schema.projects).set({ customDomainVerifiedAt: new Date() }).where(eq(schema.projects.id, project.id));
  forgetHost(project.customDomain);
  await log(project, user, "project.domain_verified", project.customDomain);
  revalidatePath(`/${slug}`, "layout");
  return { ok: t("domainVerified") };
}
