import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/Avatar";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import type { Wanter } from "@/lib/customers";
import { formatMoney, type Demand } from "@/lib/traits";

const SHOWN = 6;

/**
 * Team-only: who wants this (voters + author) with company, plan and MRR from the host app's SSO
 * traits, and the sum ("4 companies · 1 240 € MRR"). Rendered only for team viewers by the page.
 */
export function Customers({ kind, people, demand, locale, votes }: {
  kind: "bug" | "idea"; people: Wanter[]; demand: Demand; locale: Locale;
  votes: { points: number; voters: number; importance: boolean } | null;
}) {
  const t = useTranslations("board.customers");
  const tv = useTranslations("forms.vote");
  const tag = LOCALE_TAG[locale];
  const money = demand.mrr.map((m) => formatMoney(m.cents, m.currency, tag)).join(" + ");
  const anyTraits = people.some((p) => p.company || p.plan || p.mrr !== null);
  const who = demand.companies > 0
    ? (kind === "idea" ? t("wantCompanies", { n: demand.companies }) : t("affectsCompanies", { n: demand.companies }))
    : (kind === "idea" ? t("wantPeople", { n: demand.people }) : t("affectsPeople", { n: demand.people }));
  const extra = demand.companies > 0 && demand.individuals > 0 ? t("andPeople", { n: demand.individuals }) : "";

  const row = (p: Wanter) => (
    <li key={p.userId} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 py-2">
      <Avatar name={p.name ?? p.email} url={p.avatarUrl} size={24} />
      <div className="min-w-0">
        <div className="truncate text-[13.5px] font-medium">{p.name ?? p.email ?? t("anonymous")}</div>
        <div className="truncate text-[12.5px] text-muted-foreground">
          {[p.company, p.plan && t("plan", { plan: p.plan }), p.author ? t("author") : p.weight && votes?.importance ? tv(`level${p.weight as 1 | 2 | 3}`) : null]
            .filter(Boolean).join(" · ") || t("noTraits")}
        </div>
      </div>
      <span className="text-right text-[13px] font-semibold tabular-nums">
        {p.mrr !== null ? formatMoney(p.mrr, p.currency, tag) : <span className="font-normal text-muted-foreground">–</span>}
      </span>
    </li>
  );

  return (
    <section aria-labelledby="customers-h" className="grid gap-3 rounded-xl border border-dashed bg-surface p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 id="customers-h" className="font-heading text-[15px] font-bold">{kind === "idea" ? t("titleIdea") : t("titleBug")}</h2>
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground"><Lock className="size-3" />{t("teamOnly")}</span>
      </header>
      <div>
        <p className="text-[15px] font-semibold leading-snug">
          {who}{extra}{money && <> · <span className="tabular-nums">{t("mrrTotal", { mrr: money })}</span></>}
        </p>
        {votes && votes.importance && (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{tv("weighted", { points: votes.points, people: votes.voters })}</p>
        )}
      </div>
      {!anyTraits && <p className="text-[13px] text-muted-foreground">{t("noTraitsHint")}</p>}
      <ul className="divide-y border-t">{people.slice(0, SHOWN).map(row)}</ul>
      {people.length > SHOWN && (
        <details className="group">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-muted-foreground hover:text-foreground group-open:hidden">
            {t("showAll", { n: demand.people })}
          </summary>
          <ul className="divide-y">{people.slice(SHOWN).map(row)}</ul>
          {demand.people > people.length && <p className="pt-2 text-[12.5px] text-muted-foreground">{t("more", { n: demand.people - people.length })}</p>}
        </details>
      )}
    </section>
  );
}
