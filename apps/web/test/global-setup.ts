import { execSync } from "node:child_process";
import path from "node:path";
import { config } from "dotenv";

/** Applies migrations to the test database once per run. */
export default function setup() {
  config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set to run tests (see .env.example).");
  execSync("pnpm --filter @vitico/db exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
