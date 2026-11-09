import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { schema } from "@ozvi/db";
import { FONT_CATALOGUE, FONT_WEIGHTS } from "@ozvi/theme";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  FALLBACK_CSS, FILE_PATH, MAX_CSS_BYTES, MAX_FILE_BYTES, familyKey, filesInCss, isWoff2, rewriteCss, upstreamCssUrl, upstreamFileUrl,
  type FontQuery,
} from "@/lib/fonts";

/**
 * Server-side cache for first-party fonts: memory first, then disk (OZVI_FONTS_DIR, default "fonts" next to
 * the uploads folder, i.e. /data/fonts in Docker), then Google — fetched once by the server, never by visitors.
 * OZVI_FONTS_REMOTE=0 disables the Google fetch completely: only what is on disk is served, else system fonts.
 */

// A current desktop Chrome, so Google answers with woff2 and unicode-range subsets.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 6000;
const MISS_TTL_MS = 60_000;
const MEM_CSS_MAX = 400;
const MEM_FILES_MAX_BYTES = 48 * 1024 * 1024;

export function fontsDir(): string {
  const e = process.env;
  return path.resolve(e.OZVI_FONTS_DIR ?? path.join(path.dirname(path.resolve(e.OZVI_STORAGE_DIR ?? "./data/uploads")), "fonts"));
}
export const remoteFonts = () => process.env.OZVI_FONTS_REMOTE !== "0";

interface State {
  css: Map<string, string>;
  misses: Map<string, number>;
  files: Map<string, Uint8Array>;
  fileBytes: number;
  known: Set<string>;
  knownLoaded: boolean;
  inflight: Map<string, Promise<unknown>>;
  allowed?: { at: number; set: Set<string> };
}
const g = globalThis as unknown as { ozviFonts?: State };
const st: State = (g.ozviFonts ??= { css: new Map(), misses: new Map(), files: new Map(), fileBytes: 0, known: new Set(), knownLoaded: false, inflight: new Map() });

function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const running = st.inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = fn().finally(() => st.inflight.delete(key));
  st.inflight.set(key, p);
  return p;
}

async function writeAtomic(file: string, data: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

async function fetchLimited(url: string, max: number): Promise<{ status: number; body: Uint8Array | null }> {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/css,*/*;q=0.1" }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  if (!r.ok || !r.body) return { status: r.status, body: null };
  if (Number(r.headers.get("content-length") ?? 0) > max) return { status: 413, body: null };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const c of r.body as unknown as AsyncIterable<Uint8Array>) {
    size += c.length;
    if (size > max) return { status: 413, body: null };
    chunks.push(c);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return { status: r.status, body: out };
}

/** Catalogue + every Google family saved in a project's theme (cached for a minute). Never arbitrary input. */
export async function allowedFamilies(): Promise<Set<string>> {
  if (st.allowed && Date.now() - st.allowed.at < 60_000) return st.allowed.set;
  const set = new Set<string>(FONT_CATALOGUE);
  try {
    const t = schema.projects.theme;
    const rows = await db.selectDistinct({ body: sql<string | null>`${t}->'font'->>'body'`, heading: sql<string | null>`${t}->'font'->>'heading'` })
      .from(schema.projects).where(sql`coalesce(${t}->'font'->>'source', 'google') = 'google'`);
    for (const r of rows) for (const f of [r.body, r.heading]) if (f) set.add(f);
  } catch (e) {
    console.warn("[ozvi] fonts: could not read project fonts, using the catalogue only", (e as Error).message);
  }
  st.allowed = { at: Date.now(), set };
  return set;
}

function remember(key: string, css: string) {
  if (st.css.size >= MEM_CSS_MAX) st.css.delete(st.css.keys().next().value!);
  st.css.set(key, css);
  for (const f of filesInCss(css)) st.known.add(f);
}

/** Rewritten CSS for one family, or null when it cannot be had (offline, remote disabled, unknown to Google). */
async function familyCss(family: string, weights: number[]): Promise<string | null> {
  const key = familyKey(family, weights);
  const hit = st.css.get(key);
  if (hit) return hit;
  const missAt = st.misses.get(key);
  if (missAt && Date.now() - missAt < MISS_TTL_MS) return null;
  return once(`css:${key}`, async () => {
    const file = path.join(fontsDir(), "css", `${key}.css`);
    const disk = await readFile(file, "utf8").catch(() => null);
    if (disk) { remember(key, disk); return disk; }
    if (!remoteFonts()) { st.misses.set(key, Date.now()); return null; }
    try {
      let r = await fetchLimited(upstreamCssUrl(family, weights), MAX_CSS_BYTES);
      // Static families without every weight: take whatever Google has rather than nothing.
      if (r.status === 400) r = await fetchLimited(upstreamCssUrl(family, null), MAX_CSS_BYTES);
      const out = r.body && rewriteCss(new TextDecoder().decode(r.body));
      if (!out) throw new Error(`upstream ${r.status}`);
      await writeAtomic(file, out.css).catch((e) => console.warn("[ozvi] fonts: cache write failed", (e as Error).message));
      remember(key, out.css);
      return out.css;
    } catch (e) {
      console.warn(`[ozvi] fonts: ${family} unavailable (${(e as Error).message}); serving system fonts`);
      st.misses.set(key, Date.now());
      return null;
    }
  });
}

/** CSS for a parsed query. `complete` = every family resolved, so the response may be cached for a long time. */
export async function fontCss(q: FontQuery): Promise<{ css: string; complete: boolean }> {
  const parts = await Promise.all(q.families.map((f) => familyCss(f, q.weights)));
  const ok = parts.filter((p): p is string => !!p);
  return { css: ok.length ? ok.join("\n") : FALLBACK_CSS, complete: ok.length === parts.length };
}

/** Files referenced by cached CSS. After a restart the memory set is empty, so rebuild it from disk once. */
async function isKnown(p: string): Promise<boolean> {
  if (st.known.has(p)) return true;
  if (!st.knownLoaded) {
    st.knownLoaded = true;
    const dir = path.join(fontsDir(), "css");
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (!name.endsWith(".css")) continue;
      for (const f of filesInCss(await readFile(path.join(dir, name), "utf8").catch(() => ""))) st.known.add(f);
    }
  }
  return st.known.has(p);
}

/** A woff2 file, only if it was referenced by a stylesheet we produced (no fetching of arbitrary gstatic paths). */
export async function fontFile(p: string): Promise<Uint8Array | null> {
  if (!FILE_PATH.test(p)) return null;
  const hit = st.files.get(p);
  if (hit) return hit;
  return once(`file:${p}`, async () => {
    const file = path.join(fontsDir(), "files", p);
    let bytes: Uint8Array | null = await readFile(file).then((b) => new Uint8Array(b)).catch(() => null);
    if (!bytes) {
      if (!remoteFonts() || !(await isKnown(p))) return null;
      try {
        const r = await fetchLimited(upstreamFileUrl(p), MAX_FILE_BYTES);
        if (!r.body || !isWoff2(r.body)) throw new Error(`upstream ${r.status}`);
        bytes = r.body;
        await writeAtomic(file, bytes).catch((e) => console.warn("[ozvi] fonts: cache write failed", (e as Error).message));
      } catch (e) {
        console.warn(`[ozvi] fonts: file ${p} unavailable (${(e as Error).message})`);
        return null;
      }
    }
    if (!isWoff2(bytes)) return null;
    while (st.fileBytes + bytes.length > MEM_FILES_MAX_BYTES && st.files.size) {
      const [k, v] = st.files.entries().next().value!;
      st.files.delete(k); st.fileBytes -= v.length;
    }
    st.files.set(p, bytes); st.fileBytes += bytes.length;
    return bytes;
  });
}

/**
 * Downloads the catalogue (CSS + every subset file) to disk, e.g. at startup with OZVI_FONTS_PREFETCH=1,
 * so the server can later run with OZVI_FONTS_REMOTE=0 or without outbound access.
 */
export async function prefetchFonts(families: readonly string[] = FONT_CATALOGUE): Promise<{ ok: number; failed: string[] }> {
  const failed: string[] = [];
  let ok = 0;
  for (const f of families) {
    const css = await familyCss(f, [...FONT_WEIGHTS]);
    if (!css) { failed.push(f); continue; }
    const files = await Promise.all(filesInCss(css).map(fontFile));
    if (files.every(Boolean)) ok++; else failed.push(f);
  }
  return { ok, failed };
}
