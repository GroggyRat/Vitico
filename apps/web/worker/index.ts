/**
 * Background worker: delivers queued notifications and runs scheduled jobs.
 * Run with `pnpm --filter @vitico/web worker`. Safe to run several copies.
 */
import { createDb } from "@vitico/db";
import { processOutbox, requeueStuck } from "@/server/notifications/deliver";
import { defaultProviders } from "@/server/notifications/providers";
import { cleanupAuth, runScheduled } from "@/server/jobs";
import { refreshExchangeRates } from "@/server/services/pricing-admin";

const db = createDb();
const providers = defaultProviders();
const HOUR = 3_600_000;
let stopping = false;

const log = (msg: string, extra?: unknown) => console.info(`[worker] ${new Date().toISOString()} ${msg}`, extra ?? "");

async function deliverLoop() {
  while (!stopping) {
    try {
      const n = await processOutbox(db, providers);
      if (n > 0) log(`delivered batch of ${n}`);
      if (n === 25) continue; // more waiting — go again immediately
    } catch (e) {
      log("outbox error", e);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

async function scheduleLoop() {
  while (!stopping) {
    const jobs: [string, number, () => Promise<unknown>][] = [
      ["requeue-stuck", 5 * 60_000, () => requeueStuck(db)],
      ["cleanup-auth", 24 * HOUR, async () => log("auth cleanup", await cleanupAuth(db))],
      ...(process.env.FX_AUTO_REFRESH === "1"
        ? ([["fx-refresh", 24 * HOUR, async () => log("fx refreshed", await refreshExchangeRates(db, null))]] as [string, number, () => Promise<unknown>][])
        : []),
    ];
    for (const [name, every, fn] of jobs) {
      try {
        await runScheduled(db, name, every, fn);
      } catch (e) {
        log(`job ${name} failed`, e);
      }
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    log(`${sig} received, stopping`);
    stopping = true;
    setTimeout(() => process.exit(0), 6_000).unref();
  });
}

async function main() {
  log("started");
  await Promise.all([deliverLoop(), scheduleLoop()]);
  await db.$disconnect();
}

main().catch((e) => {
  log("fatal", e);
  process.exit(1);
});
