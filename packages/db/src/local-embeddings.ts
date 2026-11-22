import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { availableParallelism } from "node:os";
import path from "node:path";

/**
 * Local embedding model (OZVI_EMBEDDINGS=local, ADR-0015): multilingual-e5-small (q8, 384 dimensions) run by
 * @huggingface/transformers on the WebAssembly build of ONNX Runtime, inside the Ozvi process. No text leaves
 * the server and nothing is paid per call. WebAssembly, not onnxruntime-node: the image is Alpine (musl) and
 * onnxruntime-node ships glibc binaries only, so the same backend runs on every platform.
 *
 * The model (~135 MB) is downloaded from Hugging Face on first use into OZVI_MODELS_DIR (default "models" next
 * to the uploads folder: ./data/models locally, /data/models in Docker) and loaded from there afterwards.
 * The library is imported only when this is configured.
 *
 * Where it runs (OZVI_EMBEDDINGS_PROCESS): inside the web server the model gets its own process by default
 * ("separate", local-embeddings-child.ts), so inference never blocks requests and the memory goes back to the
 * system when OZVI_EMBEDDINGS_IDLE_MINUTES (default 0 = keep it) pass without use; a process that keeps the
 * model returns only part of it (WebAssembly memory never shrinks). The CLI and tests run it inline.
 */

export const LOCAL_MODEL_ID = "Xenova/multilingual-e5-small";
/** Pinned revision of the model repository: a changed upstream model never swaps under a running board. */
export const LOCAL_MODEL_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
/** item_embeddings.model for vectors from this model (switching providers re-embeds: rows are per model). */
export const LOCAL_MODEL = "local:multilingual-e5-small";
/** Characters embedded per text: the title and the start of the body carry the meaning, and inference time grows with length. */
export const LOCAL_MAX_CHARS = 1000;

/**
 * e5 models are trained with a prefix per role: "query: " for what is searched with, "passage: " for what is
 * searched in. Typed text (a new idea, MCP text) is a query; stored items are passages.
 */
export type E5Role = "query" | "passage";
export const e5Input = (role: E5Role, text: string) => `${role}: ${text.replace(/\s+/g, " ").trim().slice(0, LOCAL_MAX_CHARS)}`;

export function modelsDir(env: Record<string, string | undefined> = process.env): string {
  return path.resolve(env.OZVI_MODELS_DIR?.trim() || path.join(path.dirname(path.resolve(env.OZVI_STORAGE_DIR ?? "./data/uploads")), "models"));
}

/** WebAssembly threads for inference (OZVI_EMBEDDINGS_THREADS, default 1: the server shares its CPU with requests). */
export function localThreads(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.OZVI_EMBEDDINGS_THREADS);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, availableParallelism()) : 1;
}

type Output = { data: ArrayLike<number> };
export type Extractor = (text: string, opts: { pooling: "mean"; normalize: true }) => Promise<Output>;

interface State { ready?: Extractor; loading?: Promise<Extractor>; queue: Promise<unknown>; hooked?: boolean; loadMs?: number }
const g = globalThis as unknown as { ozviLocalEmbeddings?: State };
const st: State = (g.ozviLocalEmbeddings ??= { queue: Promise.resolve() });

const ORT = "__ozviOnnxruntimeWeb";
const STUBS: Record<string, string> = {
  "ozvi-stub:onnxruntime-node": `module.exports = globalThis.${ORT};`,
  "ozvi-stub:sharp": "module.exports = () => { throw new Error('Ozvi: images are not supported by the local model'); };",
};

/**
 * transformers' Node build requires onnxruntime-node (native, glibc) and sharp (images) when it is imported.
 * Neither is used here: onnxruntime-node becomes onnxruntime-web (the WebAssembly runtime, which has a Node
 * build), imported by us beforehand, and sharp a stub. Only imports made by @huggingface/transformers change.
 */
async function wasmOnly() {
  if (st.hooked) return;
  (globalThis as Record<string, unknown>)[ORT] = await import("onnxruntime-web");
  registerHooks({
    resolve(specifier, context, next) {
      const fromTransformers = /@huggingface[/+]transformers/.test(context.parentURL ?? "");
      if (fromTransformers && (specifier === "onnxruntime-node" || specifier === "sharp")) return { url: `ozvi-stub:${specifier}`, format: "commonjs", shortCircuit: true };
      return next(specifier, context);
    },
    load(url, context, next) {
      const source = STUBS[url];
      return source ? { format: "commonjs", source, shortCircuit: true } : next(url, context);
    },
  });
  st.hooked = true;
}

/** Loads the model once per process (download on first use). Concurrent callers share one load. */
function loadInline(env: Record<string, string | undefined> = process.env): Promise<Extractor> {
  if (st.ready) return Promise.resolve(st.ready);
  st.loading ??= (async () => {
    const t0 = performance.now();
    await wasmOnly();
    const t = await import("@huggingface/transformers");
    const onnx = t.env.backends.onnx as { wasm?: { numThreads?: number; wasmPaths?: unknown } };
    if (onnx.wasm) {
      onnx.wasm.numThreads = localThreads(env);
      // The library points the runtime at a CDN by default; the WebAssembly files ship with onnxruntime-web.
      onnx.wasm.wasmPaths = undefined;
    }
    t.env.useWasmCache = false;
    t.env.allowLocalModels = false;
    t.env.cacheDir = modelsDir(env);
    const pipe = await t.pipeline("feature-extraction", LOCAL_MODEL_ID, { dtype: "q8", revision: LOCAL_MODEL_REVISION });
    st.ready = pipe as unknown as Extractor;
    st.loadMs = Math.round(performance.now() - t0);
    return st.ready;
  })().catch((e) => {
    st.loading = undefined;
    throw e;
  });
  return st.loading;
}

const inlineReady = () => !!st.ready;
const inlineLoadMs = () => st.loadMs ?? null;

/** One text at a time (see embedLocal), yielding to the event loop between them. */
async function embedInline(texts: string[], role: E5Role, extractor?: Extractor): Promise<number[][]> {
  const ex = extractor ?? (await loadInline());
  const out: number[][] = [];
  for (const text of texts) {
    const run = st.queue.then(() => ex(e5Input(role, text), { pooling: "mean", normalize: true }));
    st.queue = run.catch(() => undefined);
    out.push(Array.from((await run).data));
    await new Promise((r) => setImmediate(r));
  }
  return out;
}

/* ---- separate process ---- */

type Env = Record<string, string | undefined>;
type Reply = { id: number; ok: boolean; error?: string; vectors?: number[][]; loadMs?: number | null };
interface Child {
  proc?: ChildProcess; ready?: boolean; loading?: Promise<void>; loadMs?: number | null; seq: number;
  pending: Map<number, { resolve: (r: Reply) => void; reject: (e: Error) => void }>; idle?: NodeJS.Timeout; failedAt?: number;
}
const gc = globalThis as unknown as { ozviEmbeddingsChild?: Child };
const ch: Child = (gc.ozviEmbeddingsChild ??= { seq: 0, pending: new Map() });

/** Minutes without use after which the model's process ends (OZVI_EMBEDDINGS_IDLE_MINUTES, default 0 = never). */
export function idleMinutes(env: Env = process.env): number {
  const n = Number(env.OZVI_EMBEDDINGS_IDLE_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The script the model's process runs: the bundled /app/ozvi-embeddings.mjs in the image, the TypeScript source
 * (through tsx) in a checkout. Null = none found, the model runs inline.
 */
export function childScript(cwd = process.cwd()): { file: string; execArgv: string[]; cwd: string } | null {
  // The standalone server changes into apps/web, so both are looked for in the parents too.
  for (let dir = cwd, i = 0; i < 5; i++, dir = path.dirname(dir)) {
    const bundled = path.join(dir, "ozvi-embeddings.mjs");
    if (existsSync(bundled)) return { file: bundled, execArgv: [], cwd: dir };
    const src = path.join(dir, "packages/db/src/local-embeddings-child.ts");
    if (existsSync(src)) return { file: src, execArgv: ["--import", "tsx"], cwd: path.join(dir, "packages/db") };
  }
  return null;
}

/**
 * OZVI_EMBEDDINGS_PROCESS=separate: the model in its own process. The web server sets it at start
 * (instrumentation.ts) unless an operator chose "inline"; the CLI, tests and the child itself run inline.
 */
export function runsSeparately(env: Env = process.env): boolean {
  if (env.OZVI_EMBEDDINGS_CHILD === "1") return false;
  return env.OZVI_EMBEDDINGS_PROCESS?.trim().toLowerCase() === "separate" && !!childScript();
}

function stopChild(reason: string) {
  const p = ch.proc;
  ch.proc = undefined; ch.ready = false; ch.loading = undefined;
  if (ch.idle) clearTimeout(ch.idle);
  for (const [, w] of ch.pending) w.reject(new Error(reason));
  ch.pending.clear();
  if (p && p.exitCode === null) p.kill();
}

function touch(env: Env) {
  if (ch.idle) clearTimeout(ch.idle);
  const min = idleMinutes(env);
  if (min) ch.idle = setTimeout(() => stopChild("idle"), min * 60_000).unref();
}

function ask(msg: { op: "load" } | { op: "embed"; texts: string[]; role: E5Role }): Promise<Reply> {
  const proc = ch.proc;
  if (!proc?.connected) return Promise.reject(new Error("embedding process not running"));
  const id = ++ch.seq;
  return new Promise<Reply>((resolve, reject) => {
    ch.pending.set(id, { resolve, reject });
    proc.send({ id, ...msg });
  }).then((r) => (r.ok ? r : Promise.reject(new Error(r.error ?? "embedding failed"))));
}

function startChild(env: Env): Promise<void> {
  // A model that failed to load (no network for the download, too little memory) is retried after a minute.
  if (ch.failedAt && Date.now() - ch.failedAt < 60_000) return Promise.reject(new Error("local embedding model failed to load recently"));
  const script = childScript()!;
  // Through getBuiltinModule: the bundler would otherwise try to resolve the script path at build time.
  const { fork } = process.getBuiltinModule("node:child_process") as typeof import("node:child_process");
  const proc = fork(script.file, [], {
    cwd: script.cwd, execArgv: script.execArgv, serialization: "advanced",
    env: { ...env, OZVI_EMBEDDINGS_CHILD: "1", NODE_OPTIONS: "" } as unknown as NodeJS.ProcessEnv,
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  ch.proc = proc;
  proc.on("message", (r: Reply) => {
    const w = ch.pending.get(r.id);
    if (w) { ch.pending.delete(r.id); w.resolve(r); }
  });
  proc.on("exit", (code, signal) => { if (ch.proc === proc) stopChild(`embedding process ended (${signal ?? code})`); });
  proc.on("error", (e) => { if (ch.proc === proc) stopChild(e.message); });
  return ask({ op: "load" }).then((r) => {
    ch.ready = true; ch.loadMs = r.loadMs ?? null; ch.failedAt = undefined;
    touch(env);
  }, (e) => {
    ch.failedAt = Date.now();
    stopChild("load failed");
    throw e;
  });
}

/* ---- public API: the same either way ---- */

/** Loads the model once (download on first use); concurrent callers share one load. */
export function loadLocalModel(env: Env = process.env): Promise<unknown> {
  if (!runsSeparately(env)) return loadInline(env);
  if (ch.ready && ch.proc?.connected) return Promise.resolve();
  ch.loading ??= startChild(env);
  return ch.loading;
}

export const localModelReady = (env: Env = process.env) => (runsSeparately(env) ? !!ch.ready && !!ch.proc?.connected : inlineReady());
export const localModelLoadMs = (env: Env = process.env) => (runsSeparately(env) ? ch.loadMs ?? null : inlineLoadMs());

/**
 * Embeds texts one at a time (no padding to the longest; one WebAssembly session, which is not re-entrant),
 * yielding to the event loop between them. Vectors are normalized (cosine = dot product). `extractor` (tests,
 * the evaluation) always runs inline.
 */
export async function embedLocal(texts: string[], role: E5Role, extractor?: Extractor, env: Env = process.env): Promise<number[][]> {
  if (extractor || !runsSeparately(env)) return embedInline(texts, role, extractor);
  await loadLocalModel(env);
  touch(env);
  return (await ask({ op: "embed", texts, role })).vectors!;
}
