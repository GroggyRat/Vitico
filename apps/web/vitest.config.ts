import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside the Next.js server bundle.
      "server-only": path.resolve(import.meta.dirname, "test/empty.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup.ts"],
    // Integration tests share one database.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
