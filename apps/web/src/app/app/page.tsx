import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LAST_WORKSPACE_COOKIE, pickWorkspace } from "@/lib/last-workspace";
import { getAccount, workspacesOf } from "@/lib/account";

export const dynamic = "force-dynamic";

/** The console always works inside one workspace: the one open last time (the switcher lists the rest). */
export default async function ConsoleHome({ searchParams }: { searchParams: Promise<{ created?: string; workspaceDeleted?: string }> }) {
  const { created, workspaceDeleted } = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const all = await workspacesOf(account.id);
  if (all.length === 0) redirect("/app/new");
  // After deleting a workspace: the next one, saying so.
  if (workspaceDeleted) redirect(`/app/w/${all[0]!.id}?workspaceDeleted=1`);
  const target = pickWorkspace(all, { created, last: (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value })!;
  redirect(`/app/w/${target.id}${created ? `?created=${encodeURIComponent(created)}` : ""}`);
}
