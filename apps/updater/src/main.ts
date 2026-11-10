import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { decide, inWindow, MODES, parseFeed, parseImageRef, type Mode } from "./policy";
import { imageRef, runningVersion, update, type Config } from "./runner";
import { run } from "./sh";
import { loadState, saveState, type State } from "./state";

/**
 * ozvi-updater: an optional sidecar for self-hosted Ozvi (docs/SELFHOST.md → Aktualizácie).
 * Talks only to the Ozvi web container (status API, event callback) and to Docker for the "ozvi"
 * service of its own compose project. Modes: notify (shown in the admin only) · manual (button in the admin) ·
 * auto (nightly window; minor and patch only, never a new major or a release marked breaking).
 */

const env = process.env;
const TOKEN = env.OZVI_UPDATER_TOKEN ?? "";
if (TOKEN.length < 24) {
  console.error("OZVI_UPDATER_TOKEN must be set (at least 24 characters, the same value as in the ozvi service)");
  process.exit(1);
}
const WEB = (env.OZVI_WEB_URL ?? "http://ozvi:3000").replace(/\/$/, "");
const FEED = env.OZVI_RELEASES_URL ?? "https://ozvi.io/releases.json";
const WINDOW = env.OZVI_UPDATE_WINDOW ?? "02:00-05:00";
const TZ = env.TZ ?? "UTC";
const STATE = env.OZVI_UPDATER_STATE ?? "/state/state.json";
const DEFAULT_MODE: Mode = MODES.includes(env.OZVI_UPDATE_MODE as Mode) ? (env.OZVI_UPDATE_MODE as Mode) : "manual";

const cfg: Config = {
  projectDir: env.OZVI_DIR ?? "/project",
  service: env.OZVI_SERVICE ?? "ozvi",
  healthUrl: `${WEB}/api/health`,
  dbAdminUrl: env.OZVI_DB_ADMIN_URL ?? "",
  dbName: env.OZVI_DB_NAME ?? "ozvi",
  dbOwner: env.OZVI_DB_OWNER ?? "ozvi",
  backupDir: env.OZVI_BACKUP_DIR ?? "/backups",
  keepBackups: Number(env.OZVI_KEEP_BACKUPS ?? 5) || 5,
  healthTimeoutMs: (Number(env.OZVI_HEALTH_TIMEOUT ?? 180) || 180) * 1000,
};
if (!cfg.dbAdminUrl) {
  console.error("OZVI_DB_ADMIN_URL must be set (postgres superuser URL, used for the backup and the restore)");
  process.exit(1);
}

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
let state: State = await loadState(STATE, DEFAULT_MODE);
let busy: Promise<void> | null = null;
let phase: string | null = null;

async function save() { await saveState(STATE, state).catch((e) => log(`could not save state: ${(e as Error).message}`)); }

/** Tells the web app (history; an e-mail to OZVI_ADMIN_EMAILS only on rollback or failure). Best effort. */
async function event(body: Record<string, unknown>) {
  try {
    const res = await fetch(`${WEB}/api/updater/event`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) log(`event ${body.type} → web answered ${res.status}`);
  } catch (e) {
    log(`event ${body.type} not delivered: ${(e as Error).message}`);
  }
}

async function refreshFeed(force = false) {
  if (!force && state.feedAt && Date.now() - Date.parse(state.feedAt) < 6 * 3_600_000) return;
  try {
    const res = await fetch(FEED, { signal: AbortSignal.timeout(10_000), headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.releases = parseFeed(await res.json());
    state.feedAt = new Date().toISOString();
    await save();
  } catch (e) {
    log(`release list unavailable: ${(e as Error).message}`);
  }
}

async function snapshot(trigger: "manual" | "scheduled") {
  const [current, ref] = await Promise.all([runningVersion(cfg), imageRef(cfg).catch(() => null)]);
  const d = ref && current ? decide({ current, releases: state.releases, ref, mode: state.mode, trigger }) : null;
  return { current, ref, decision: d };
}

function start(trigger: "manual" | "scheduled"): { started: boolean; reason?: string } {
  if (busy) return { started: false, reason: "busy" };
  busy = (async () => {
    try {
      phase = "checking";
      await refreshFeed(trigger === "manual");
      const s = await snapshot(trigger);
      if (!s.decision?.update) {
        if (trigger === "manual") log(`nothing to do: ${s.decision ? s.decision.reason : "ozvi is not reachable"}`);
        return;
      }
      phase = "updating";
      await event({ type: "started", from: s.current, to: s.decision.target.version, trigger });
      const out = await update(cfg, s.decision.target, (m) => { log(m); phase = m.split(":")[0]!.slice(0, 80); });
      log(`result ${out.result}${out.message ? `: ${out.message}` : ""}`);
      state.history.unshift({ at: new Date().toISOString(), trigger, ...out });
      await save();
      if (out.result !== "noChange") await event({ type: out.result, trigger, ...out });
    } catch (e) {
      log(`update aborted: ${(e as Error).message}`);
      state.history.unshift({ at: new Date().toISOString(), trigger, from: "unknown", to: null, result: "failed", message: (e as Error).message });
      await save();
      await event({ type: "failed", trigger, message: (e as Error).message });
    } finally {
      busy = null;
      phase = null;
    }
  })();
  return { started: true };
}

/** Every 10 minutes: refresh the list, announce new releases once, update inside the window in auto mode. */
async function tick() {
  if (busy) return;
  await refreshFeed();
  const s = await snapshot("scheduled").catch(() => null);
  const d = s?.decision;
  if (!d) return;
  const newer = d.update ? d.target : d.newer;
  if (newer && !state.announced.includes(newer.version) && !(d.update && inWindow(new Date(), WINDOW, TZ))) {
    state.announced.push(newer.version);
    await save();
    await event({ type: "available", from: s!.current, to: newer.version, reason: d.update ? "auto" : d.reason, url: newer.url, breaking: !!newer.breaking });
  }
  // A version that already failed or was rolled back is never retried unattended; the button still works.
  const failedBefore = d.update && state.history.some((h) => h.to === d.target.version && (h.result === "rolledBack" || h.result === "failed"));
  if (d.update && !failedBefore && inWindow(new Date(), WINDOW, TZ)) start("scheduled");
}

// ── HTTP API for the web app (internal network only) ─────────────────────────────────────────────

function authorized(req: IncomingMessage) {
  const got = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 10_000) throw new Error("too large"); }
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

const send = (res: ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://updater");
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });
    if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

    if (req.method === "GET" && url.pathname === "/status") {
      const s = await snapshot("manual");
      return send(res, 200, {
        mode: state.mode, window: WINDOW, timeZone: TZ,
        current: s.current, ref: s.ref, line: s.ref ? parseImageRef(s.ref).line : null,
        decision: s.decision, releases: state.releases.slice(0, 10), feedAt: state.feedAt,
        running: !!busy, phase, history: state.history.slice(0, 10),
      });
    }
    if (req.method === "PUT" && url.pathname === "/mode") {
      const { mode } = await readJson(req);
      if (!MODES.includes(mode as Mode)) return send(res, 400, { error: "mode" });
      state.mode = mode as Mode;
      await save();
      log(`mode → ${state.mode}`);
      return send(res, 200, { mode: state.mode });
    }
    if (req.method === "POST" && url.pathname === "/update") {
      if (state.mode === "notify") return send(res, 409, { error: "notifyOnly" });
      const r = start("manual");
      return send(res, r.started ? 202 : 409, r.started ? { started: true } : { error: r.reason });
    }
    if (req.method === "POST" && url.pathname === "/check") {
      await refreshFeed(true);
      return send(res, 200, { feedAt: state.feedAt, releases: state.releases.slice(0, 10) });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: (e as Error).message });
  }
}).listen(Number(env.PORT ?? 8787), () => log(`ozvi-updater listening on ${env.PORT ?? 8787}, mode ${state.mode}, window ${WINDOW} ${TZ}`));

// Private registry (ghcr.io): log in once with the read-only token the operator received.
if (env.OZVI_REGISTRY_TOKEN) {
  const registry = env.OZVI_REGISTRY ?? "ghcr.io";
  await run("docker", ["login", registry, "-u", env.OZVI_REGISTRY_USER ?? "ozvi", "--password-stdin"], { input: env.OZVI_REGISTRY_TOKEN, timeoutMs: 30_000 })
    .then(() => log(`logged in to ${registry}`))
    .catch((e) => log(`registry login failed: ${(e as Error).message}`));
}

setTimeout(() => void tick(), 15_000);
setInterval(() => void tick(), 10 * 60_000);
