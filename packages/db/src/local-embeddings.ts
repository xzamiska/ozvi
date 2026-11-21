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
export function loadLocalModel(env: Record<string, string | undefined> = process.env): Promise<Extractor> {
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

export const localModelReady = () => !!st.ready;
export const localModelLoadMs = () => st.loadMs ?? null;

/**
 * Embeds texts one at a time (no padding to the longest; one WebAssembly session, which is not re-entrant),
 * yielding to the event loop between them. Vectors are normalized (cosine = dot product).
 */
export async function embedLocal(texts: string[], role: E5Role, extractor?: Extractor): Promise<number[][]> {
  const ex = extractor ?? (await loadLocalModel());
  const out: number[][] = [];
  for (const text of texts) {
    const run = st.queue.then(() => ex(e5Input(role, text), { pooling: "mean", normalize: true }));
    st.queue = run.catch(() => undefined);
    out.push(Array.from((await run).data));
    await new Promise((r) => setImmediate(r));
  }
  return out;
}
