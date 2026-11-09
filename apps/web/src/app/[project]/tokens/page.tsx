import { schema, withProject } from "@ozvi/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { RevokeToken, TokenForm } from "@/components/IntegrationForms";
import { Page, PageHead, Panel } from "@/components/ozvi/page";
import { codeBox, hint, preBox, SettingsSection } from "@/components/settings-base";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { isTeamRole } from "@/lib/domain";
import { projectOrigin } from "@/lib/email/url";
import { ago } from "@/lib/format";
import { getCtx } from "@/lib/project";
import { LOCALE_TAG } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { Gate } from "../_gate";
import { boardTitle } from "@/lib/board-meta";

export const generateMetadata = boardTitle("admin.tokens");

export default async function Tokens({ params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user, locale } = await getCtx(slug);
  const a = await getTranslations({ locale, namespace: "admin" });
  const t = await getTranslations({ locale, namespace: "admin.tokens" });
  if (!user || !isTeamRole(user.role)) {
    return <Gate project={project} locale={locale} signedIn={!!user} returnTo={`/${slug}/tokens`} title={t("gateTitle")}
      text={user ? t("gateNoRole") : t("gateSignIn")} />;
  }
  const tokens = await withProject(db, project.id, (tx) => tx.select().from(schema.apiTokens)
    .where(and(eq(schema.apiTokens.userId, user.id), isNull(schema.apiTokens.revokedAt))).orderBy(desc(schema.apiTokens.createdAt)));
  // Per-board URL for tokens and OAuth alike: it also works on the board's custom domain or cloud subdomain,
  // where the instance-wide /mcp is not served (proxy.ts routes only /<slug>/… there).
  const connector = `${projectOrigin(project)}/${slug}/mcp`;
  const mcp = connector;

  return (
    <Page>
      <PageHead
        title={t("title")}
        lede={t("lede", { name: project.name })}
      />

      <div className="grid max-w-[820px] gap-14">
        <SettingsSection id="aktivne" title={t("active")} text={t("activeText")}>
          {tokens.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-surface/60 px-5 py-6 text-center text-[14px] text-muted-foreground">{t("none")}</p>
          ) : (
            <Panel as="ul" className="divide-y">
              {tokens.map((tk) => (
                <li key={tk.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">{tk.name}<Badge variant="outline">{a(`scope.${tk.scope}`)}</Badge></p>
                    <p className="text-[13px] text-muted-foreground">
                      <code className="font-mono">{tk.prefix}…</code> · {a("token.created", { when: ago(tk.createdAt, locale) })} · {tk.lastUsedAt ? a("token.used", { when: ago(tk.lastUsedAt, locale) }) : a("token.unused")}
                      {" · "}{tk.expiresAt ? a("token.validUntil", { date: tk.expiresAt.toLocaleDateString(LOCALE_TAG[locale]) }) : a("token.noExpiry")}
                    </p>
                  </div>
                  <RevokeToken slug={slug} id={tk.id} name={tk.name} />
                </li>
              ))}
            </Panel>
          )}
        </SettingsSection>

        <SettingsSection id="novy" title={t("new")} text={t("newText")}>
          <TokenForm slug={slug} mcpUrl={mcp} canTriage />
        </SettingsSection>

        <SettingsSection id="pripojenie" title={t("connect")} text={t("connectText")}>
          <Panel as="ul" className="divide-y">
            <li className="grid min-w-0 gap-2 p-5 sm:p-6">
              <p className="text-[14.5px] font-semibold">{t("connectors")}</p>
              <p className={hint}>{t("connectorsText")}</p>
              <code className={codeBox}>{connector}</code>
            </li>
            <li className="grid min-w-0 gap-2 p-5 sm:p-6">
              <p className="text-[14.5px] font-semibold">Claude Code</p>
              <p className={hint}>{t("codeA")} <code className="font-mono">ozvi_pat_…</code> {t("codeB")}</p>
              <pre tabIndex={0} className={preBox}>{`claude mcp add --transport http ozvi ${mcp} \\
  --header "Authorization: Bearer ozvi_pat_…"`}</pre>
            </li>
            <li className="grid min-w-0 gap-2 p-5 sm:p-6">
              <p className="text-[14.5px] font-semibold">{t("others")}</p>
              <p className={hint}>{t("othersText")}</p>
              <pre tabIndex={0} className={preBox}>{`URL:    ${mcp}
Header: Authorization: Bearer ozvi_pat_…`}</pre>
            </li>
          </Panel>
          <p className={hint}>{t("ask")}</p>
        </SettingsSection>
      </div>
    </Page>
  );
}
