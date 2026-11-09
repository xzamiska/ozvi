/**
 * Import a Fider board into an Ozvi project — the same engine as Admin → Import → Fider
 * (src/lib/import/engine.ts): idempotent by Fider ids, no e-mails or webhooks, undoable from the admin.
 *
 *   pnpm --filter @ozvi/web import:fider --project billiwo \
 *        (--from postgres://fider:…@host/fider [--tenant feedback] | --backup backup.zip | --api https://feedback.example.com)
 *        [--provider _billiwo] [--bug-tag bug | --no-bugs] [--dry-run]
 *
 * --api reads the administrator's API key from FIDER_API_KEY (never from the command line).
 * Users keep their host-app identity: the uid at the host app's OAuth provider (the only custom "_…"
 * provider, or --provider) becomes the Ozvi external id. Posts tagged --bug-tag become private bug
 * reports; post numbers are kept when free. Running it again imports only what is new in Fider.
 */
import { createDb, schema, withProject, withSystem } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { applyImport, previewImport, type FileLoader } from "../src/lib/import/engine";
import { emptyRows, fiderApiFiles, fiderFromApi, fiderFromBackup, fiderSummary, fiderToImport, type FiderRows } from "../src/lib/import/fider";

const { values: args } = parseArgs({
  options: {
    from: { type: "string" }, backup: { type: "string" }, api: { type: "string" }, project: { type: "string" }, tenant: { type: "string" },
    provider: { type: "string" }, "bug-tag": { type: "string" }, "no-bugs": { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false },
  },
});
const sources = [args.from, args.backup, args.api].filter(Boolean).length;
if (!args.project || sources !== 1) {
  console.error("Usage: import-fider --project <ozvi slug> (--from <fider postgres url> [--tenant <subdomain>] | --backup <backup.zip> | --api <fider url>, key in FIDER_API_KEY)\n" +
    "                    [--provider <name>] [--bug-tag bug | --no-bugs] [--dry-run]");
  process.exit(2);
}

/** Fider's Postgres → the same rows a backup.zip carries (blobs stored in the database included). */
async function fromPostgres(url: string): Promise<{ rows: FiderRows; load: FileLoader }> {
  const fider = postgres(url, { max: 2, onnotice: () => {} });
  try {
    const [tenant] = args.tenant
      ? await fider`select id, name, subdomain from tenants where subdomain = ${args.tenant} or cname = ${args.tenant}`
      : await fider`select id, name, subdomain from tenants order by id limit 1`;
    if (!tenant) throw new Error("Fider tenant not found");
    const t = tenant.id as number;
    const rows = emptyRows();
    rows.tenant = { name: tenant.name as string, subdomain: tenant.subdomain as string };
    rows.users = await fider`select id, name, email, role, status, email_supressed_at from users where tenant_id = ${t}` as never;
    rows.user_providers = await fider`select user_id, provider, provider_uid from user_providers where tenant_id = ${t}` as never;
    rows.tags = await fider`select id, name, slug, color, is_public from tags where tenant_id = ${t}` as never;
    rows.posts = await fider`select * from posts where tenant_id = ${t} order by number` as never;
    rows.post_tags = await fider`select post_id, tag_id from post_tags where tenant_id = ${t}` as never;
    rows.post_votes = await fider`select user_id, post_id, created_at from post_votes where tenant_id = ${t}` as never;
    rows.comments = await fider`select id, content, post_id, user_id, created_at, deleted_at from comments where tenant_id = ${t}` as never;
    rows.attachments = await fider`select post_id, comment_id, attachment_bkey from attachments where tenant_id = ${t}` as never;
    const blobs = new Map<string, Uint8Array>();
    for (const b of await fider`select b.key, b.file from blobs b join attachments a on a.attachment_bkey = b.key and a.tenant_id = b.tenant_id where b.tenant_id = ${t}`) {
      if (b.file) blobs.set(b.key as string, new Uint8Array(b.file as Buffer));
    }
    return { rows, load: async (ref) => blobs.get(ref) ?? null };
  } finally {
    await fider.end();
  }
}

const db = createDb();
try {
  let rows: FiderRows;
  let load: FileLoader;
  if (args.from) ({ rows, load } = await fromPostgres(args.from));
  else if (args.backup) {
    const b = fiderFromBackup(new Uint8Array(readFileSync(args.backup)));
    rows = b.rows;
    load = async (ref) => b.blobs.get(ref) ?? null;
  } else {
    const key = process.env.FIDER_API_KEY?.trim();
    if (!key) throw new Error("Set FIDER_API_KEY to an administrator's Fider API key");
    rows = await fiderFromApi(args.api!, key, { fetch });
    load = fiderApiFiles(args.api!, key, fetch);
  }

  const summary = fiderSummary(rows);
  const options = {
    bugTag: args["no-bugs"] ? null : args["bug-tag"] ?? summary.suggested.bugTag,
    provider: args.provider ?? summary.suggested.provider,
  };
  const data = fiderToImport(rows, options);

  const project = await withSystem(db, async (tx) => (await tx.select().from(schema.projects).where(eq(schema.projects.slug, args.project!)))[0]);
  if (!project) throw new Error(`Ozvi project "${args.project}" not found`);

  const p = await withProject(db, project.id, (tx) => previewImport(tx, data));
  const mapped = data.users.filter((u) => u.externalId && !u.externalId.startsWith("email:") && !u.externalId.startsWith("fider:")).length;
  console.log(`${args["dry-run"] ? "[dry run, nothing saved] " : ""}Fider "${summary.tenant ?? "?"}" → Ozvi "${project.slug}"`);
  console.log(`  bug tag: ${options.bugTag ?? "— (all ideas)"}, host-app provider: ${options.provider ?? "— (e-mail only)"} (${mapped} people keep their app identity)`);
  console.log(`  new: ${p.items.ideas} ideas, ${p.items.bugs} bugs, ${p.users.create} people (+${p.users.existing} already here), ${p.votes.create} votes, ${p.comments.create} comments, ${p.files.create} files`);
  console.log(`  tags: ${p.tags.create.length ? p.tags.create.join(", ") : "none new"}${p.numbers ? `; numbers kept ${p.numbers.kept}, renumbered ${p.numbers.changed}` : ""}`);
  if (p.items.skip) console.log(`  already imported earlier (skipped): ${p.items.skip} posts`);
  if (args["dry-run"]) process.exit(0);

  const [run] = await withProject(db, project.id, (tx) => tx.insert(schema.importRuns).values({
    projectId: project.id, source: "fider", label: `Fider ${summary.tenant ?? ""} (CLI)`.trim(), status: "running",
  }).returning({ id: schema.importRuns.id }));
  const save = (set: Partial<typeof schema.importRuns.$inferInsert>) => withProject(db, project.id, (tx) => tx.update(schema.importRuns).set(set).where(eq(schema.importRuns.id, run!.id)));
  const total = data.users.length + data.items.length + data.comments.length + data.votes.length + (data.files?.length ?? 0);
  try {
    const r = await applyImport(db, project, run!.id, data, async (done) => { if (done % 500 === 0) await save({ done, total }); }, load);
    await save({ status: "done", total, done: total, report: { phase: "done", ...r }, finishedAt: new Date() });
    console.log(`  done: ${r.items} posts (${r.merged} merged duplicates), ${r.votes} votes, ${r.comments} comments, ${r.users} people, ${r.tags} tags, ${r.files} files` +
      (r.skipped.files ? ` (${r.skipped.files} files missing or over the limit)` : ""));
    console.log(`  undo: Admin → Import → "${`Fider ${summary.tenant ?? ""} (CLI)`.trim()}" → Undo`);
  } catch (e) {
    await save({ status: "failed", error: "failed", finishedAt: new Date() });
    throw e;
  }
} finally {
  await db.$client.end();
}
