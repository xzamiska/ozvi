import type { NextRequest } from "next/server";
import { exportMine } from "@/lib/privacy";
import { getCtx } from "@/lib/project";
import { getTranslations } from "next-intl/server";

export async function GET(_: NextRequest, { params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user, locale } = await getCtx(slug);
  if (!user) return new Response((await getTranslations({ locale, namespace: "boardAuth" }))("signInFirst"), { status: 401 });
  return new Response(JSON.stringify(await exportMine(project, user), null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${slug}-${locale === "en" ? "my-data" : "moje-udaje"}.json"`, "cache-control": "no-store" },
  });
}
