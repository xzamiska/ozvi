import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { backupsToPrune, type Release } from "./policy";
import { run } from "./sh";

/**
 * The update itself, driven through `docker compose` in the operator's project directory, so compose
 * stays the single source of truth (same image ref, env, volumes, networks). Steps:
 *   1. pg_dump the database      4. wait until /api/health is ok and the container runs the new version
 *   2. compose pull ozvi         5. on failure: stop, restore the dump, re-tag the old image, start it
 *   3. compose up -d ozvi
 * Migrations only go forward, so a rollback without restoring the dump would run old code on a new schema.
 */

export interface Config {
  projectDir: string;
  service: string;
  healthUrl: string;
  dbAdminUrl: string;
  dbName: string;
  dbOwner: string;
  backupDir: string;
  keepBackups: number;
  healthTimeoutMs: number;
}

export interface Outcome {
  result: "updated" | "rolledBack" | "failed" | "noChange";
  from: string;
  to: string | null;
  message?: string;
  backup?: string;
}

type Log = (msg: string) => void;
/**
 * Compose runs with a clean environment: only the project's .env decides interpolation, exactly as when
 * the operator runs it on the host (the updater's own variables must not leak into the ozvi service).
 */
const composeEnv = (c: Config): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PWD: c.projectDir,
  ...(process.env.DOCKER_CONFIG ? { DOCKER_CONFIG: process.env.DOCKER_CONFIG } : {}),
  ...(process.env.DOCKER_HOST ? { DOCKER_HOST: process.env.DOCKER_HOST } : {}),
});
const compose = (c: Config, args: string[], timeoutMs = 600_000) =>
  run("docker", ["compose", ...args], { cwd: c.projectDir, timeoutMs, env: composeEnv(c) });

/** The image reference compose resolves for the service (OZVI_IMAGE from the operator's .env). */
export async function imageRef(c: Config): Promise<string> {
  const cfg = JSON.parse(await compose(c, ["config", "--format", "json"], 30_000)) as { services?: Record<string, { image?: string }> };
  const ref = cfg.services?.[c.service]?.image;
  if (!ref) throw new Error(`service "${c.service}" has no image in the compose project`);
  return ref;
}

/**
 * Version of the running container, but only once it answers /api/health with ok. The version comes
 * from the image label, so the public health endpoint never has to reveal it.
 */
export async function runningVersion(c: Config, timeoutMs = 5000): Promise<string | null> {
  try {
    const res = await fetch(c.healthUrl, { signal: AbortSignal.timeout(timeoutMs) });
    const body = (await res.json()) as { ok?: boolean };
    if (!res.ok || !body.ok) return null;
    const id = (await compose(c, ["ps", "-q", c.service], 30_000)).trim().split("\n")[0];
    if (!id) return null;
    const v = (await run("docker", ["inspect", "-f", '{{index .Config.Labels "org.opencontainers.image.version"}}', id], { timeoutMs: 30_000 })).trim();
    return v && v !== "<no value>" ? v : "unknown";
  } catch {
    return null;
  }
}

async function waitHealthy(c: Config, expect: (v: string) => boolean, log: Log): Promise<string | null> {
  const until = Date.now() + c.healthTimeoutMs;
  while (Date.now() < until) {
    const v = await runningVersion(c, 3000);
    if (v && expect(v)) return v;
    await new Promise((r) => setTimeout(r, 3000));
  }
  log(`health check timed out after ${Math.round(c.healthTimeoutMs / 1000)} s`);
  return null;
}

const imageId = async (ref: string) => (await run("docker", ["image", "inspect", "-f", "{{.Id}}", ref], { timeoutMs: 30_000 })).trim();
const imageVersion = async (ref: string) =>
  (await run("docker", ["image", "inspect", "-f", '{{index .Config.Labels "org.opencontainers.image.version"}}', ref], { timeoutMs: 30_000 })).trim();

/** URL of the maintenance database on the same server (to drop/create the app database). */
function maintenanceUrl(adminUrl: string) {
  const u = new URL(adminUrl);
  u.pathname = "/postgres";
  return u.toString();
}

export async function backup(c: Config, version: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(c.backupDir, `ozvi-${stamp}-${version.replace(/[^\w.-]/g, "_")}.dump`);
  await run("pg_dump", ["--format=custom", `--file=${file}`, `--dbname=${c.dbAdminUrl}`], { timeoutMs: 30 * 60_000 });
  return file;
}

export async function restore(c: Config, file: string) {
  const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const m = maintenanceUrl(c.dbAdminUrl);
  await run("psql", ["-v", "ON_ERROR_STOP=1", `--dbname=${m}`, "-c", `DROP DATABASE IF EXISTS ${ident(c.dbName)} WITH (FORCE)`], { timeoutMs: 120_000 });
  await run("psql", ["-v", "ON_ERROR_STOP=1", `--dbname=${m}`, "-c", `CREATE DATABASE ${ident(c.dbName)} OWNER ${ident(c.dbOwner)}`], { timeoutMs: 120_000 });
  await run("pg_restore", ["--exit-on-error", `--dbname=${c.dbAdminUrl}`, file], { timeoutMs: 60 * 60_000 });
}

async function pruneBackups(c: Config, log: Log) {
  try {
    for (const n of backupsToPrune(await readdir(c.backupDir), c.keepBackups)) await rm(join(c.backupDir, n), { force: true });
  } catch (e) {
    log(`could not prune backups: ${(e as Error).message}`);
  }
}

export async function update(c: Config, target: Release | null, log: Log): Promise<Outcome> {
  const ref = await imageRef(c);
  const from = (await runningVersion(c)) ?? "unknown";
  const oldId = await imageId(ref).catch(() => null);
  log(`updating ${ref} from ${from}${target ? ` to ${target.version}` : ""}`);

  let file: string;
  try {
    file = await backup(c, from);
    log(`backup ${file}`);
  } catch (e) {
    // No backup, no update: without it a failed migration could not be undone.
    return { result: "failed", from, to: null, message: `backup failed, nothing changed: ${(e as Error).message}` };
  }

  try {
    await compose(c, ["pull", "--quiet", c.service]);
  } catch (e) {
    return { result: "failed", from, to: null, backup: file, message: `pull failed, nothing changed: ${(e as Error).message}` };
  }
  const newId = await imageId(ref);
  const label = await imageVersion(ref).catch(() => "");
  const newVersion = label && label !== "<no value>" ? label : null;
  if (newId === oldId) {
    log("registry has nothing newer for this tag");
    await rm(file, { force: true });
    return { result: "noChange", from, to: null, message: "the registry has no newer image for this tag yet" };
  }

  log(`starting ${newVersion ?? newId.slice(7, 19)}`);
  let failure: string | null = null;
  try {
    await compose(c, ["up", "-d", c.service]);
    const v = await waitHealthy(c, (v) => (newVersion ? v === newVersion : v !== from), log);
    if (!v) failure = "the new version did not become healthy (see `docker compose logs ozvi`)";
  } catch (e) {
    failure = (e as Error).message;
  }

  if (!failure) {
    await pruneBackups(c, log);
    if (oldId) await run("docker", ["image", "rm", oldId], { timeoutMs: 60_000 }).catch(() => { /* still used or already gone */ });
    return { result: "updated", from, to: newVersion, backup: file };
  }

  log(`rolling back: ${failure}`);
  try {
    await compose(c, ["stop", c.service], 120_000);
    await restore(c, file);
    if (!oldId) throw new Error("the previous image is unknown");
    await run("docker", ["tag", oldId, ref], { timeoutMs: 30_000 });
    await compose(c, ["up", "-d", c.service]);
    const v = await waitHealthy(c, (v) => v === from || from === "unknown", log);
    if (!v) throw new Error("the previous version did not come back healthy");
    return { result: "rolledBack", from, to: newVersion, backup: file, message: failure };
  } catch (e) {
    return { result: "failed", from, to: newVersion, backup: file, message: `${failure}; rollback failed: ${(e as Error).message}` };
  }
}
