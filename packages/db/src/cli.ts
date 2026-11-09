/**
 * Operator CLI, bundled into the image as /app/ozvi.mjs:
 *   docker compose exec ozvi node ozvi.mjs project:create myapp "My app" --preset les --origin https://app.example.com
 *   … --theme /data/myapp-theme.json   (your own theme.json instead of a preset)
 *   docker compose exec ozvi node ozvi.mjs project:list
 */
import { presets, themeSchema } from "@ozvi/theme";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { parseArgs } from "node:util";
import { createDb, encryptSecret, newSecret, withSystem } from "./index";
import { projects, workspaces } from "./schema";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { preset: { type: "string", default: "ozvi" }, theme: { type: "string" }, origin: { type: "string", multiple: true }, "login-url": { type: "string" } },
});
const [cmd, slug, name] = positionals;
const db = createDb();

try {
  if (cmd === "project:list") {
    for (const p of await db.select({ slug: projects.slug, name: projects.name, origins: projects.allowedOrigins }).from(projects)) {
      console.log(`${p.slug}\t${p.name}\t${p.origins.join(" ")}`);
    }
  } else if (cmd === "project:create" && slug && name) {
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) throw new Error("slug: lowercase letters, digits and dashes");
    const start = values.theme
      ? JSON.parse(readFileSync(values.theme, "utf8"))
      : presets[values.preset as keyof typeof presets];
    if (!start) throw new Error(`unknown preset "${values.preset}" (${Object.keys(presets).join(", ")})`);
    const theme = themeSchema.parse({ ...start, name });
    const secret = newSecret();
    await withSystem(db, async (tx) => {
      const [w] = await tx.insert(workspaces).values({ slug: "default", name: "Default" })
        .onConflictDoUpdate({ target: workspaces.slug, set: { name: "Default" } }).returning();
      const exists = await tx.select().from(projects).where(eq(projects.slug, slug));
      if (exists.length) throw new Error(`project "${slug}" already exists`);
      await tx.insert(projects).values({
        workspaceId: w!.id, slug, name, theme, ssoSecretEnc: encryptSecret(secret),
        allowedOrigins: values.origin ?? [], loginUrl: values["login-url"] ?? null,
      });
    });
    const base = (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");
    console.log(`Project "${slug}" created.\n`);
    console.log(`OZVI_SSO_SECRET=${secret}\n`);
    console.log("Shown once — set it in your app, then sign users in with signOzviToken() from @ozvi/sdk.");
    console.log(`Board: ${base}/${slug}/ideas   Settings (role "admin" in the token): ${base}/${slug}/admin`);
  } else {
    console.log(`Usage:\n  ozvi.mjs project:create <slug> "<Name>" [--preset ${Object.keys(presets).join("|")} | --theme theme.json] [--origin https://app.example.com] [--login-url URL]\n  ozvi.mjs project:list`);
    process.exitCode = 2;
  }
} catch (e) {
  console.error(String((e as Error).message));
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
