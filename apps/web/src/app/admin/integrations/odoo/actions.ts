"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/actions";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { audit } from "@/server/audit";
import { createTransport, odooConfigFromEnv } from "@/server/odoo/client";
import { enqueueOdoo, processOdooTasks, pullAccounting, testConnection } from "@/server/odoo/sync";

function client() {
  const cfg = odooConfigFromEnv();
  if (!cfg) throw new Error("Odoo isn't configured (ODOO_URL, ODOO_DB, ODOO_API_KEY).");
  return createTransport(cfg);
}

async function run(fn: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await fn();
    revalidatePath("/admin/integrations/odoo");
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function testOdooAction(_: ActionState): Promise<ActionState> {
  await requireStaff("integrations.manage");
  return run(async () => `Connected to ${await testConnection(client())}.`);
}

export async function syncAllCustomersAction(_: ActionState): Promise<ActionState> {
  const { actor } = await requireStaff("integrations.manage");
  return run(async () => {
    const db = getDb();
    const companies = await db.company.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    let queued = 0;
    for (const c of companies) if (await enqueueOdoo(db, "PARTNER_PUSH", c.id)) queued++;
    await audit(db, { actorId: actor.id, action: "odoo.sync_all_customers", entityType: "Integration", entityId: "odoo", data: { queued } });
    return `Queued ${queued} customer(s). The worker sends them within a minute.`;
  });
}

export async function pushNowAction(_: ActionState): Promise<ActionState> {
  await requireStaff("integrations.manage");
  return run(async () => `Processed ${await processOdooTasks(getDb(), client(), 50)} task(s).`);
}

export async function pullNowAction(_: ActionState): Promise<ActionState> {
  await requireStaff("integrations.manage");
  return run(async () => {
    const r = await pullAccounting(getDb(), client());
    return `Pulled ${r.invoices} invoice(s) and ${r.payments} payment(s) for ${r.companies} customer(s).`;
  });
}

export async function retryFailedAction(_: ActionState): Promise<ActionState> {
  await requireStaff("integrations.manage");
  return run(async () => {
    const { count } = await getDb().odooSyncTask.updateMany({ where: { status: "FAILED" }, data: { status: "PENDING", attempts: 0, runAfter: new Date() } });
    return `${count} task(s) queued again.`;
  });
}
