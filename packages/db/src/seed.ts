import { themeSchema } from "@ozvi/theme";
import { eq } from "drizzle-orm";
import { createDb, encryptSecret, withProject, withSystem } from "./index";
import { items, projects, users, votes, workspaces } from "./schema";

/**
 * Dev seed: one workspace with Billiwo and Apinido, their themes and a few items.
 * Both projects use OZVI_SSO_SECRET so you can sign test tokens with the same value.
 */
const db = createDb(process.env.DATABASE_URL ?? "postgres://ozvi:ozvi@localhost:5446/ozvi");
const sso = process.env.OZVI_SSO_SECRET ?? "change-me-at-least-32-characters-long";

/** Our own products' themes — dev seed only, not shipped as presets (they are set per project in production). */
const themes = {
  billiwo: {
    name: "Billiwo",
    colors: { accent: "#7C3AED", ink: "#1B1830", surface: "#FFFFFF", canvas: "#ECEEF3", border: "#DCDDE6" },
    font: { body: "Funnel Sans", heading: "Funnel Display", source: "google" },
    radius: 14,
  },
  apinido: {
    name: "Apinido",
    colors: { accent: "#1E6B4F", ink: "#101815", surface: "#FFFFFF", canvas: "#FCFCFA", border: "#E4E7E2" },
    font: { body: "Inter", heading: "Manrope", source: "google" },
    radius: 8,
  },
} as const;

const data = {
  billiwo: {
    ideas: [
      ["Export faktúr do Pohody", "Mesačne exportujeme ručne, chceli by sme XML.", "planned", 41],
      ["Opakované faktúry s inou splatnosťou", "Pri niektorých klientoch 30 dní, pri iných 14.", "open", 17],
      ["Tmavý režim", "Večer sa s tým robí lepšie.", "in_progress", 12],
    ],
    bugs: [["PDF faktúry nemá diakritiku v adrese", "Ulica sa zobrazí ako „Hlavn  12“.", "fixed"]],
  },
  apinido: {
    ideas: [["Plánované úlohy (cron) v UI", "Chcem nastaviť nočný export bez kódu.", "open", 9]],
    bugs: [],
  },
} as const;

await withSystem(db, async (tx) => {
  const [w] = await tx.insert(workspaces).values({ slug: "zaso", name: "Zaso" })
    .onConflictDoUpdate({ target: workspaces.slug, set: { name: "Zaso" } }).returning();
  for (const key of ["billiwo", "apinido"] as const) {
    await tx.insert(projects).values({
      workspaceId: w!.id, slug: key, name: themes[key].name, theme: themeSchema.parse(themes[key]), ssoSecretEnc: encryptSecret(sso),
      allowedOrigins: ["http://localhost:3300", "http://localhost:5173"],
    }).onConflictDoNothing();
  }
});

for (const key of ["billiwo", "apinido"] as const) {
  const p = await db.query.projects.findFirst({ where: (t, { eq }) => eq(t.slug, key) });
  if (!p || p.itemSeq > 0) continue; // already seeded
  await withProject(db, p.id, async (tx) => {
    const [author] = await tx.insert(users).values({ projectId: p.id, externalId: "seed", name: "Mária" }).returning();
    // Real vote rows, never a bare vote_count: counts are recomputed from votes on every vote.
    const maxVotes = Math.max(0, ...data[key].ideas.map((i) => i[3]));
    const voters = maxVotes === 0 ? [] : await tx.insert(users).values(
      Array.from({ length: maxVotes }, (_, i) => ({ projectId: p.id, externalId: `seed-voter-${i + 1}`, name: `Hlasujúci ${i + 1}` })),
    ).returning({ id: users.id });
    let n = 0;
    for (const [title, body, status, count] of data[key].ideas) {
      const [item] = await tx.insert(items).values({ projectId: p.id, kind: "idea", number: ++n, title, body, status, voteCount: count, authorId: author!.id }).returning();
      await tx.insert(votes).values(voters.slice(0, count).map((v) => ({ projectId: p.id, itemId: item!.id, userId: v.id })));
    }
    for (const [title, body, status] of data[key].bugs) {
      await tx.insert(items).values({ projectId: p.id, kind: "bug", number: ++n, title, body, status, authorId: author!.id,
        context: { url: "/invoices/2026-0412", appVersion: "2.14.0", browser: "Chrome 141" }, fixedInVersion: "2.14.1" });
    }
    await tx.update(projects).set({ itemSeq: n }).where(eq(projects.id, p.id));
  });
}

console.log("seeded: billiwo, apinido");
await db.$client.end();
