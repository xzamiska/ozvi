import { presets } from "@ozvi/theme";
import { redirect } from "next/navigation";
import { NewProjectForm } from "@/components/NewProjectForm";
import { Page, PageHead } from "@/components/ozvi/page";
import { getTranslations } from "next-intl/server";
import { getAccount, workspacesOf } from "@/lib/account";

/** /app/new?w=<id> adds a project to that workspace; /app/new?workspace=new founds a new workspace with it. */
export default async function NewProject({ searchParams }: { searchParams: Promise<{ w?: string; workspace?: string }> }) {
  const { w, workspace } = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const workspaces = await workspacesOf(account.id);
  const newWorkspace = workspace === "new" && workspaces.length > 0;
  const a = await getTranslations("account");
  const t = await getTranslations("account.newProject");
  const swatches = Object.entries(presets).map(([id, p]) => ({ id, name: p.name, accent: p.colors.accent, canvas: p.colors.canvas, ink: p.colors.ink }));
  return (
    <Page measure="max-w-[760px]">
      <PageHead
        title={newWorkspace ? t("newWorkspaceTitle") : workspaces.length ? t("title") : t("welcome")}
        back={workspaces.length ? { href: w ? `/app/w/${w}` : "/app", label: a("layout.backToConsole") } : undefined}
        lede={newWorkspace ? t("newWorkspaceLede") : t("lede")}
      />
      <NewProjectForm initial={w} newWorkspace={newWorkspace} workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} swatches={swatches} base={(process.env.PUBLIC_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")} />
    </Page>
  );
}
