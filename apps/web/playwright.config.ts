import path from "node:path";
import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const PORT = 3100;
const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error("TEST_DATABASE_URL must be set to run e2e tests (see .env.example).");

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use a preinstalled browser when provided (e.g. sandboxed environments).
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  // Runs the production build; run `pnpm build` first.
  webServer: {
    command: `pnpm start --port ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    env: { DATABASE_URL, APP_URL: `http://localhost:${PORT}` },
  },
});
