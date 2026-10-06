/**
 * Background worker: delivers queued notifications and runs scheduled jobs.
 * Run with `pnpm --filter @vitico/web worker`. Safe to run several copies.
 */
import { createDb } from "@vitico/db";
import { processOutbox, requeueStuck } from "@/server/notifications/deliver";
import { defaultProviders } from "@/server/notifications/providers";
import { cleanupAuth, runScheduled } from "@/server/jobs";
import { expireAndWarn, settlePeriods } from "@/server/rebates/service";
import { runDealJobs } from "@/server/deals/service";
import { refreshExchangeRates } from "@/server/services/pricing-admin";
import { createTransport, odooConfigFromEnv } from "@/server/odoo/client";
import { processOdooTasks, pullAccounting } from "@/server/odoo/sync";

const db = createDb();
const providers = defaultProviders();
const odooConfig = odooConfigFromEnv();
const odoo = odooConfig ? createTransport(odooConfig) : null;
const HOUR = 3_600_000;
let stopping = false;

const log = (msg: string, extra?: unknown) => console.info(`[worker] ${new Date().toISOString()} ${msg}`, extra ?? "");

async function deliverLoop() {
  while (!stopping) {
    try {
      const n = await processOutbox(db, providers);
      if (n > 0) log(`delivered batch of ${n}`);
      if (n === 25) continue; // more waiting, go again immediately
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
      ...(odoo
        ? ([
            ["odoo-push", 10_000, async () => { const n = await processOdooTasks(db, odoo); if (n) log(`odoo: processed ${n} task(s)`); }],
            ["odoo-pull", 15 * 60_000, async () => log("odoo: pulled accounting", await pullAccounting(db, odoo))],
          ] as [string, number, () => Promise<unknown>][])
        : []),
      ["cleanup-auth", 24 * HOUR, async () => log("auth cleanup", await cleanupAuth(db))],
      ["rebate-settle", 6 * HOUR, async () => log(`rebates: ${await settlePeriods(db)} period credit(s)`)],
      ["rebate-expire", 24 * HOUR, async () => log(`rebates: ${await expireAndWarn(db)} expired`)],
      ["deal-drops", 5 * 60_000, async () => log("deals", await runDealJobs(db))],
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
    await new Promise((r) => setTimeout(r, 10_000));
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
  log(`started (odoo ${odoo ? `on: ${odooConfig!.url} / ${odooConfig!.db} via ${odooConfig!.protocol}` : "off"})`);
  await Promise.all([deliverLoop(), scheduleLoop()]);
  await db.$disconnect();
}

main().catch((e) => {
  log("fatal", e);
  process.exit(1);
});
