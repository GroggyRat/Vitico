import { execSync } from "node:child_process";

/** Fresh, seeded test database for each e2e run. */
export default function setup() {
  const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL };
  for (const cmd of ["exec prisma migrate deploy", "truncate", "exec prisma db seed"]) {
    execSync(`pnpm --filter @vitico/db ${cmd}`, { stdio: "inherit", env });
  }
}
