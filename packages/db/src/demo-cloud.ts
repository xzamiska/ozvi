import { eq } from "drizzle-orm";
import { createDb, encryptSecret, withProject, withSystem } from "./index";
import { activity, comments, emails, items, projects, users, votes, webhookDeliveries, webhooks } from "./schema";

/**
 * Local cloud only (`pnpm db:demo:cloud [slug]`): fills one project of the local cloud database with
 * believable traffic so the console has something to show — host-app users, ideas and bugs in
 * different stops, comments, sent and failed e-mails, webhook calls and activity. Runs once per project.
 */
const url = process.env.DATABASE_URL ?? "postgres://ozvi:ozvi@localhost:5446/ozvi_cloud";
if (!/ozvi_cloud/.test(url)) throw new Error("Demo data are meant for the local cloud database (ozvi_cloud) only.");
const db = createDb(url);
const slug = process.argv[2] ?? "fakturnik";

const p = await db.query.projects.findFirst({ where: eq(projects.slug, slug) });
if (!p) throw new Error(`Project "${slug}" does not exist. Create it in the console first.`);
if (p.itemSeq > 0) {
  console.log(`${slug} already has items, nothing to do.`);
  process.exit(0);
}

const ago = (days: number, hours = 0) => new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);

await withProject(db, p.id, async (tx) => {
  const people = await tx.insert(users).values([
    { projectId: p.id, externalId: "app-101", name: "Mária Nováková", email: "maria@klient.test" },
    { projectId: p.id, externalId: "app-102", name: "Peter Horváth", email: "peter@klient.test" },
    { projectId: p.id, externalId: "app-103", name: "Jana Kováčová", email: "jana@klient.test" },
    { projectId: p.id, externalId: "app-104", name: "Tomáš Varga", email: "tomas@klient.test" },
    { projectId: p.id, externalId: "app-105", name: "Eva Tóthová", email: "eva@klient.test" },
  ]).returning();
  const [maria, peter, jana, tomas, eva] = people as [typeof people[number], typeof people[number], typeof people[number], typeof people[number], typeof people[number]];
  const team = await tx.query.users.findFirst({ where: eq(users.role, "admin") });

  const rows = await tx.insert(items).values([
    { projectId: p.id, number: 1, kind: "idea", title: "Export faktúr do Pohody", body: "Každý mesiac prepisujeme faktúry ručne. XML export by nám ušetril hodinu.", status: "planned", authorId: maria.id, createdAt: ago(12) },
    { projectId: p.id, number: 2, kind: "idea", title: "Opakované faktúry s vlastnou splatnosťou", body: "Niektorí klienti majú 30 dní, iní 14.", status: "open", authorId: peter.id, createdAt: ago(3) },
    { projectId: p.id, number: 3, kind: "idea", title: "Tmavý režim", body: "Večer sa s tým pracuje lepšie.", status: "in_progress", authorId: jana.id, createdAt: ago(20) },
    { projectId: p.id, number: 4, kind: "idea", title: "Pripomienka neuhradenej faktúry e-mailom", body: "", status: "open", authorId: eva.id, createdAt: ago(1, 4) },
    { projectId: p.id, number: 5, kind: "bug", title: "PDF faktúry nemá diakritiku v adrese", body: "Ulica sa zobrazí ako „Hlavn  12“.", status: "fixed", fixedInVersion: "2.15.0", authorId: maria.id, createdAt: ago(9) },
    { projectId: p.id, number: 6, kind: "bug", title: "Po uložení klienta sa stratí IČ DPH", body: "Stačí upraviť adresu a IČ DPH zmizne.", status: "new", authorId: tomas.id, createdAt: ago(0, 5),
      context: { url: "/klienti/42", browser: "Safari 19", os: "macOS 16", appVersion: "2.15.1" } },
    { projectId: p.id, number: 7, kind: "bug", title: "Dashboard sa načítava 10 sekúnd", body: "Od včera je prehľad veľmi pomalý.", status: "new", authorId: peter.id, createdAt: ago(0, 2) },
    { projectId: p.id, number: 8, kind: "bug", title: "Nedá sa nahrať logo vo formáte SVG", body: "", status: "confirmed", authorId: jana.id, createdAt: ago(4) },
  ]).returning();
  await tx.update(projects).set({ itemSeq: rows.length }).where(eq(projects.id, p.id));
  const byNo = (n: number) => rows.find((r) => r.number === n)!;

  await tx.insert(votes).values([maria, peter, jana, tomas, eva].flatMap((u, i) => [
    { projectId: p.id, itemId: byNo(1).id, userId: u.id },
    ...(i < 3 ? [{ projectId: p.id, itemId: byNo(3).id, userId: u.id }] : []),
    ...(i % 2 === 0 ? [{ projectId: p.id, itemId: byNo(2).id, userId: u.id }] : []),
  ]));
  await tx.update(items).set({ voteCount: 5 }).where(eq(items.id, byNo(1).id));
  await tx.update(items).set({ voteCount: 3 }).where(eq(items.id, byNo(3).id));
  await tx.update(items).set({ voteCount: 3 }).where(eq(items.id, byNo(2).id));

  await tx.insert(comments).values([
    { projectId: p.id, itemId: byNo(1).id, authorId: peter.id, body: "Pridávam sa, ideálne aj s dobropismi.", createdAt: ago(2) },
    { projectId: p.id, itemId: byNo(1).id, authorId: team?.id ?? null, body: "Plánujeme na marec, začneme faktúrami, dobropisy hneď potom.", createdAt: ago(1) },
    { projectId: p.id, itemId: byNo(6).id, authorId: tomas.id, body: "Deje sa to aj pri úprave telefónu.", createdAt: ago(0, 3) },
    { projectId: p.id, itemId: byNo(8).id, authorId: team?.id ?? null, body: "Potvrdené, SVG neprejde kontrolou typu súboru.", internal: true, createdAt: ago(3) },
  ]);

  const mail = (to: string, kind: string, subject: string, status: "sent" | "failed" | "deferred" | "queued", at: Date, lastError?: string) => ({
    projectId: p.id, to, kind, subject, summary: subject, html: `<p>${subject}</p>`, text: subject, status,
    sentAt: status === "sent" ? at : null, createdAt: at, attempts: status === "failed" ? 5 : status === "sent" ? 1 : 0, lastError: lastError ?? null,
  });
  await tx.insert(emails).values([
    mail("vlastnik@firma.test", "new_bug", "Nové hlásenie: Dashboard sa načítava 10 sekúnd", "sent", ago(0, 2)),
    mail("vlastnik@firma.test", "new_bug", "Nové hlásenie: Po uložení klienta sa stratí IČ DPH", "sent", ago(0, 5)),
    mail("tomas@klient.test", "comment", "Nový komentár: Po uložení klienta sa stratí IČ DPH", "queued", ago(0, 1)),
    mail("maria@klient.test", "comment", "Nový komentár: Export faktúr do Pohody", "sent", ago(1)),
    mail("peter@klient.test", "comment", "Nový komentár: Export faktúr do Pohody", "sent", ago(1)),
    mail("maria@klient.test", "idea_status", "Plánované: Export faktúr do Pohody", "sent", ago(2)),
    mail("jana@stara-firma.test", "bug_status", "Potvrdené: Nedá sa nahrať logo vo formáte SVG", "failed", ago(4), "550 5.1.1 Recipient address rejected: mailbox does not exist"),
    mail("maria@klient.test", "bug_status", "Opravené: PDF faktúry nemá diakritiku v adrese", "sent", ago(6)),
  ]);

  const [hook] = await tx.insert(webhooks).values({ projectId: p.id, url: "https://hooks.slack.com/services/T000/B000/demo", format: "slack", secretEnc: encryptSecret("demo-webhook-secret") }).returning();
  await tx.insert(webhookDeliveries).values([
    { projectId: p.id, webhookId: hook!.id, event: "item.created", payload: {}, status: "sent", attempts: 1, responseCode: 200, sentAt: ago(0, 2), createdAt: ago(0, 2) },
    { projectId: p.id, webhookId: hook!.id, event: "item.created", payload: {}, status: "sent", attempts: 1, responseCode: 200, sentAt: ago(0, 5), createdAt: ago(0, 5) },
    { projectId: p.id, webhookId: hook!.id, event: "item.status_changed", payload: {}, status: "failed", attempts: 6, responseCode: 404, lastError: "HTTP 404 no_service", createdAt: ago(2) },
  ]);
});

await withSystem(db, (tx) => tx.insert(activity).values([
  { workspaceId: p.workspaceId, projectId: p.id, actor: "vlastnik@firma.test", action: "project.theme", createdAt: ago(5) },
  { workspaceId: p.workspaceId, projectId: p.id, actor: "vlastnik@firma.test", action: "webhook.added", detail: "hooks.slack.com", createdAt: ago(5, 1) },
  { workspaceId: p.workspaceId, projectId: p.id, actor: "vlastnik@firma.test", action: "token.created", detail: "Claude Code – notebook (triage)", createdAt: ago(3) },
  { workspaceId: p.workspaceId, actor: "vlastnik@firma.test", action: "member.invited", detail: "clen@firma.test (Člen)", createdAt: ago(7) },
  { workspaceId: p.workspaceId, actor: "clen@firma.test", action: "member.joined", createdAt: ago(6, 20) },
]));

console.log(`Demo data in ${slug}: 5 users, 8 items, comments, 8 e-mails, 3 webhook calls, activity.`);
process.exit(0);
