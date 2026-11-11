import { schema } from "@ozvi/db";
import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/account";
import { db } from "@/lib/db";
import { Landing } from "./Landing";
import { landingMetadata } from "./landing-page";

export const dynamic = "force-dynamic";

export const generateMetadata = () => landingMetadata("sk");

/** Self-host usually has one project: send visitors straight to it. */
export default async function Home() {
  if (process.env.OZVI_MODE === "cloud") return <Landing locale="sk" signedIn={!!(await getAccount())} />;
  const [p] = await db.select({ slug: schema.projects.slug }).from(schema.projects).orderBy(asc(schema.projects.createdAt)).limit(1);
  if (p) redirect(`/${p.slug}`);
  return (
    <main id="main" tabIndex={-1} className="oz-frame grid min-h-dvh place-content-center gap-3 py-16">
      <h1 className="font-heading text-2xl font-bold">Ozvi beží</h1>
      <p className="max-w-[60ch] text-muted-foreground">
        Zatiaľ tu nie je žiadny projekt. Vytvorte ho príkazom <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">docker compose exec ozvi node ozvi.mjs project:create mojaappka &quot;Moja appka&quot;</code> (pri vývoji <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">pnpm db:seed</code>).
      </p>
    </main>
  );
}
