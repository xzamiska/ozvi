import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/ozvi/page";
import { ActivityLine, ConsoleHead } from "@/components/ozvi/console";
import { Button } from "@/components/ui/button";
import { getAccount } from "@/lib/account";
import { LOCALE_TAG } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { activityActor, activityDetail, activityLabel, activityOf } from "@/lib/activity";
import { consoleWorkspace } from "@/lib/console";
import { consoleTitle } from "@/lib/board-meta";

export const generateMetadata = consoleTitle("activity");

export const dynamic = "force-dynamic";

const PAGE = 100;

export default async function ActivityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  const { id } = await params;
  const { before } = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = await consoleWorkspace(account.id, id);
  if (!ws) notFound();
  const from = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
  const rows = await activityOf(ws.id, { before: from, limit: PAGE });
  const locale = await requestLocale();
  const t = await getTranslations("console.activity");
  const day = new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = new Intl.DateTimeFormat(LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit" });

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = day.format(r.a.createdAt);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <div>
      <ConsoleHead
        title={t("title")}
        lede={t("lede")}
      />
      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")} text={t("emptyText")} />
      ) : (
        <div className="grid gap-8">
          {[...groups].map(([label, items]) => (
            <section key={label} className="grid gap-2">
              <h2 className="text-[12.5px] font-medium text-muted-foreground first-letter:uppercase">{label}</h2>
              <ol className="divide-y rounded-xl border bg-surface">
                {items.map(({ a, project }) => (
                  <li key={a.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 px-4 py-3 text-[14px] sm:px-5">
                    <time dateTime={a.createdAt.toISOString()} className="pt-px text-[13px] text-muted-foreground tabular-nums">{time.format(a.createdAt)}</time>
                    <ActivityLine label={activityLabel(a.action, locale)} detail={activityDetail(a.action, a.detail, locale)} actor={activityActor(a.actor, locale)} project={project} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {rows.length === PAGE && (
            <Button asChild variant="outline" className="justify-self-start">
              <Link href={`?before=${encodeURIComponent(rows[rows.length - 1]!.a.createdAt.toISOString())}`}>{t("older")}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
