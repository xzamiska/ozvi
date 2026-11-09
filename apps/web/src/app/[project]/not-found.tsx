"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, Page } from "@/components/ozvi/page";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

/** Unknown item, entry or page on a board: stays inside the board's header and theme. */
export default function BoardNotFound() {
  const { project } = useParams<{ project: string }>();
  const t = useTranslations("board");
  return (
    <Page>
      <EmptyState level={1} className="mx-auto max-w-[640px]" title={t("notFound.title")}
        text={t("notFound.text")}
        action={<Button asChild size="lg" variant="outline"><Link href={`/${project}/ideas`}>{t("gate.backToIdeas")}</Link></Button>} />
    </Page>
  );
}
