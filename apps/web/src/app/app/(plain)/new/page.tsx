import { presets } from "@ozvi/theme";
import { redirect } from "next/navigation";
import { NewProjectForm } from "@/components/NewProjectForm";
import { Page, PageHead } from "@/components/ozvi/page";
import { getTranslations } from "next-intl/server";
import { getAccount, workspacesOf } from "@/lib/account";

export default async function NewProject({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const workspaces = await workspacesOf(account.id);
  const a = await getTranslations("account");
  const t = await getTranslations("account.newProject");
  const swatches = Object.entries(presets).map(([id, p]) => ({ id, name: p.name, accent: p.colors.accent, canvas: p.colors.canvas, ink: p.colors.ink }));
  return (
    <Page measure="max-w-[760px]">
      <PageHead
        title={workspaces.length ? t("title") : t("welcome")}
        back={workspaces.length ? { href: w ? `/app/w/${w}` : "/app", label: a("layout.backToConsole") } : undefined}
        lede={t("lede")}
      />
      <NewProjectForm initial={w} workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} swatches={swatches} base={(process.env.PUBLIC_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "")} />
    </Page>
  );
}
