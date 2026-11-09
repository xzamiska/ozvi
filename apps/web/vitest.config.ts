import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
  // tsconfig keeps JSX for Next.js ("preserve"); tests that render a page need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      // server-only throws outside React Server Components; tests are server code anyway.
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
