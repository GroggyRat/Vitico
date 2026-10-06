import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load the repo-root .env so `pnpm db:*` works from any directory.
loadEnv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Fallback lets `prisma generate` run (e.g. in CI install) without a database.
    url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/vitico",
  },
});
