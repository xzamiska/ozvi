import { redirect } from "next/navigation";
import { getAccount, workspacesOf } from "@/lib/account";

export const dynamic = "force-dynamic";

/** The console always works inside one workspace: open the first one (the switcher lists the rest). */
export default async function ConsoleHome({ searchParams }: { searchParams: Promise<{ created?: string; workspaceDeleted?: string }> }) {
  const { created, workspaceDeleted } = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const all = await workspacesOf(account.id);
  if (all.length === 0) redirect("/app/new");
  // After deleting a workspace: the next one, saying so.
  if (workspaceDeleted) redirect(`/app/w/${all[0]!.id}?workspaceDeleted=1`);
  const target = (created && all.find((w) => w.projects.some((p) => p.slug === created))) || all[0]!;
  redirect(`/app/w/${target.id}${created ? `?created=${encodeURIComponent(created)}` : ""}`);
}
