import { defineConfig } from "vitest/config";
import { testEnv } from "./test-db";

export default defineConfig({ test: { globalSetup: ["./test-db.ts"], env: testEnv() } });
