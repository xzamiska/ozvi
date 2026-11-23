/**
 * The local embedding model's own process (local-embeddings.ts, separate mode). The web server starts it on
 * first use and talks to it over IPC; it ends with the server (the IPC channel closes) or when the server
 * stops it after OZVI_EMBEDDINGS_IDLE_MINUTES without use, which returns all of its memory to the system
 * (WebAssembly memory never shrinks inside a living process). Bundled into the image as /app/ozvi-embeddings.mjs.
 */
import { embedLocal, loadLocalModel, localModelLoadMs, type E5Role } from "./local-embeddings";

type Request = { id: number; op: "load" } | { id: number; op: "embed"; texts: string[]; role: E5Role };

const send = (m: unknown) => process.send?.(m);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

process.on("message", (m: Request) => {
  if (m.op === "load") {
    loadLocalModel().then(() => send({ id: m.id, ok: true, loadMs: localModelLoadMs() }), (e) => send({ id: m.id, ok: false, error: message(e) }));
  } else if (m.op === "embed") {
    embedLocal(m.texts, m.role).then((vectors) => send({ id: m.id, ok: true, vectors }), (e) => send({ id: m.id, ok: false, error: message(e) }));
  }
});
process.on("disconnect", () => process.exit(0));
