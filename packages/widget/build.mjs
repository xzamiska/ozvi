import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { BUDGET, common, sharedPreact } from "./build-config.mjs";

// Output straight into the web app's public folder so one image serves /widget.js.
const out = new URL("../../apps/web/public/", import.meta.url).pathname;
const dist = new URL("./dist/", import.meta.url).pathname;

await build({ ...common, entryPoints: ["src/index.tsx"], outfile: `${out}widget.js` });
await build({ ...common, entryPoints: ["src/shot.ts"], outfile: `${out}widget-shot.js` });
await build({ ...common, entryPoints: ["src/annotate.ts"], outfile: `${out}widget-annotate.js` });
// Lazy chunks render with widget.js's Preact (window.__ozviP), so they don't carry their own copy.
await build({ ...common, entryPoints: ["src/ideas.tsx"], outfile: `${out}widget-ideas.js`, plugins: [sharedPreact] });
await build({ ...common, entryPoints: ["src/embeds.tsx"], outfile: `${out}widget-embeds.js`, plugins: [sharedPreact] });
// Language packs (lang-pack.ts): pl/hu/de strings of every chunk, loaded before the first render in those languages.
for (const l of ["pl", "hu", "de"]) await build({ ...common, entryPoints: [`src/lang/${l}.ts`], outfile: `${out}widget-lang-${l}.js` });

// npm entry points: @ozvi/widget (plain ESM), @ozvi/widget/react, @ozvi/widget/vue, with .d.ts.
await build({
  entryPoints: ["src/loader.ts", "src/react.ts", "src/vue.ts"], outdir: dist, bundle: true, format: "esm", target: "es2020",
  splitting: true, external: ["react", "vue"], legalComments: "none", chunkNames: "chunk-[hash]",
});
execFileSync("npx", ["tsc", "-p", "tsconfig.dts.json"], { stdio: "inherit" });

const kb = (f) => (gzipSync(readFileSync(`${out}${f}`)).length / 1024).toFixed(1);
const gz = gzipSync(readFileSync(`${out}widget.js`)).length;
console.log(`widget.js ${(gz / 1024).toFixed(1)} kB gzip (budget ${BUDGET / 1024} kB); on demand: ` +
  ["widget-shot.js", "widget-annotate.js", "widget-ideas.js", "widget-embeds.js"].map((f) => `${f} ${kb(f)} kB`).join(", ") + " gzip");
if (gz > BUDGET) { console.error("widget.js is over the 20 kB budget"); process.exit(1); }
