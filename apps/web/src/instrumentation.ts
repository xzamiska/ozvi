export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Optional: download the font catalogue to OZVI_FONTS_DIR in the background (then OZVI_FONTS_REMOTE=0 can run offline).
  if (process.env.OZVI_FONTS_PREFETCH === "1") {
    void import("./lib/fonts-store").then(({ prefetchFonts }) => prefetchFonts()).then(({ ok, failed }) =>
      console.log(`[ozvi] fonts prefetched: ${ok} families${failed.length ? `, unavailable: ${failed.join(", ")}` : ""}`));
  }
  // Optional: download and load the local embedding model at boot instead of on first use (OZVI_EMBEDDINGS=local).
  if (process.env.OZVI_MODELS_PREFETCH === "1" && process.env.OZVI_EMBEDDINGS?.trim().toLowerCase() === "local") {
    void import("@ozvi/db/local-embeddings").then(async ({ loadLocalModel, localModelLoadMs, modelsDir }) => {
      await loadLocalModel();
      console.log(`[ozvi] local embedding model ready in ${localModelLoadMs()} ms (${modelsDir()})`);
    }).catch((e) => console.warn("[ozvi] local embedding model unavailable", e instanceof Error ? e.message : e));
  }
  if (process.env.OZVI_WORKER === "off") return;
  const { db } = await import("./lib/db");
  const { startWorker } = await import("./lib/email/worker");
  const { startJobs } = await import("./lib/jobs");
  startWorker(db);
  startJobs(db);
  console.log("[ozvi] workers started (e-mail, webhooks, embeddings)");
}

/** Server errors (rendering, route handlers, server actions) to OZVI_ERROR_DSN when set (lib/error-report.ts). */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath: string; routeType: string; routerKind: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.OZVI_ERROR_DSN) return;
  const { reportError } = await import("./lib/error-report");
  await reportError(err, { path: request.path, method: request.method, route: context.routePath, kind: context.routeType });
}
