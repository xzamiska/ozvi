import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { WorkspaceNameForm } from "@/components/AccountForms";
import { ConsoleHead } from "@/components/ozvi/console";
import { Panel } from "@/components/ozvi/page";
import { getAccount } from "@/lib/account";
import { consoleTitle } from "@/lib/board-meta";
import { consoleWorkspace } from "@/lib/console";

export const generateMetadata = consoleTitle("settings");
export const dynamic = "force-dynamic";

/** Workspace settings: the name (owners change it; members see it). */
export default async function WorkspaceSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = await consoleWorkspace(account.id, id);
  if (!ws) notFound();
  const t = await getTranslations("console.settings");
  const owner = ws.role === "owner";
  return (
    <div>
      <ConsoleHead title={t("title")} lede={t("lede")} />
      <section aria-labelledby="ws-general" className="grid gap-3">
        <h2 id="ws-general" className="text-[15px] font-semibold tracking-tight">{t("general")}</h2>
        <Panel>
          {owner ? <WorkspaceNameForm key={ws.name} workspaceId={ws.id} name={ws.name} /> : (
            <div className="grid gap-1 p-4 sm:p-5">
              <p className="text-[13px] font-medium text-muted-foreground">{t("name")}</p>
              <p className="text-[15px] font-semibold">{ws.name}</p>
              <p className="text-[13px] text-muted-foreground">{t("ownerOnly")}</p>
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
