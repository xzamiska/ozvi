/** Shared by build.mjs and the size-budget test (src/size.test.ts). */

/** Initial widget.js, gzip. Everything else loads on demand. */
export const BUDGET = 20 * 1024;

export const common = { bundle: true, minify: true, format: "iife", target: "es2020", legalComments: "none", jsx: "automatic", jsxImportSource: "preact" };

/** Lazy chunks import "preact" normally; at build time it becomes widget.js's own instance (window.__ozviP). */
export const sharedPreact = {
  name: "ozvi-shared-preact",
  setup(b) {
    b.onResolve({ filter: /^preact(\/hooks|\/jsx-runtime)?$/ }, (a) => ({ path: a.path, namespace: "ozvi-p" }));
    b.onLoad({ filter: /.*/, namespace: "ozvi-p" }, (a) => ({
      contents: `module.exports = window.__ozviP.${a.path === "preact" ? "preact" : a.path.endsWith("hooks") ? "hooks" : "jsx"};`,
      loader: "js",
    }));
  },
};
