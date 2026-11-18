import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testEnv } from "../../packages/db/test-db";

export default defineConfig({
  // DB tests run against their own database (packages/db/test-db.ts), not the one `pnpm dev` uses.
  test: { include: ["src/**/*.test.ts"], globalSetup: ["../../packages/db/test-db.ts"], env: testEnv() },
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
