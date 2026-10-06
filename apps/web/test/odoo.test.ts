import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@vitico/db";
import { Json2Transport, JsonRpcTransport, OdooError, odooConfigFromEnv } from "@/server/odoo/client";
import { enqueueOdoo, processOdooTasks, pullAccounting, pushOrder, pushPartner } from "@/server/odoo/sync";
import { addToCart } from "@/server/orders/cart";
import { advanceOrder, cancelOrder, creditAvailable, placeOrder } from "@/server/orders/orders";
import { approveCompany } from "@/server/services/companies";
import { FakeOdoo } from "./fake-odoo";
import { createCategory, createCompany, createProduct, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
let odoo: FakeOdoo;
const ENV = { ODOO_URL: "https://vitico-test.odoo.com", ODOO_DB: "vitico-test", ODOO_API_KEY: "key" };

beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
  odoo = new FakeOdoo();
  Object.assign(process.env, ENV);
});
afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
});

async function companyWithAddress(name = "Bula Mart") {
  const c = await createCompany(ref, { name });
  await db.address.create({ data: { companyId: c.company.id, label: "Store", line1: "12 Queens Rd", city: "Nadi", regionId: ref.fiji.id, isDefault: true } });
  await db.company.update({ where: { id: c.company.id }, data: { taxNumber: "50-12345", creditLimit: 1000 } });
  return c;
}

async function confirmedOrder(c: Awaited<ReturnType<typeof companyWithAddress>>, method: PaymentMethod = PaymentMethod.ON_ACCOUNT) {
  const cat = await createCategory();
  const p = await createProduct(cat.id, { sku: "TUN-48", onHand: 50, basePrice: 100 });
  const owner = { userId: c.owner.id, companyId: c.company.id, isStaff: false };
  await addToCart(db, owner, p.id, 2);
  const order = await placeOrder(db, owner, { kind: "customer", actor: c.actor, orderLimitCents: null }, method);
  const { actor } = await createStaff("ADMIN", `ops${Math.random()}@vitico.test`);
  await advanceOrder(db, actor, order.id, "CONFIRMED");
  return { order, ops: actor };
}

describe("partners", () => {
  it("creates the partner once and updates it afterwards", async () => {
    const { company } = await companyWithAddress();
    const id = await pushPartner(db, odoo, company.id);
    const partner = odoo.tables["res.partner"][0];
    expect(partner).toMatchObject({ id, name: "Bula Mart", ref: `VIT:${company.id}`, vat: "50-12345", city: "Nadi", country_id: 1, is_company: true });
    expect((await db.company.findUniqueOrThrow({ where: { id: company.id } })).odooPartnerId).toBe(id);

    await db.company.update({ where: { id: company.id }, data: { name: "Bula Mart (Nadi)", odooPartnerId: null } });
    expect(await pushPartner(db, odoo, company.id)).toBe(id); // found again by ref — no duplicate
    expect(odoo.tables["res.partner"]).toHaveLength(1);
    expect(odoo.tables["res.partner"][0].name).toBe("Bula Mart (Nadi)");
  });
});

describe("orders", () => {
  it("pushes a confirmed sale order with lines, creating unknown products", async () => {
    const c = await companyWithAddress();
    const { order } = await confirmedOrder(c);
    const saleId = await pushOrder(db, odoo, order.id);
    const sale = odoo.tables["sale.order"][0];
    expect(sale).toMatchObject({ id: saleId, origin: order.number, state: "sale" });
    expect(sale.order_line).toEqual([[0, 0, expect.objectContaining({ product_uom_qty: 2, price_unit: 100 })]]);
    expect(odoo.tables["product.product"][0]).toMatchObject({ default_code: "TUN-48" });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ odooOrderId: saleId, odooOrderName: sale.name });
    // Retrying is a no-op.
    await pushOrder(db, odoo, order.id);
    expect(odoo.tables["sale.order"]).toHaveLength(1);
  });

  it("reuses a sale order created before a crash (found by origin)", async () => {
    const c = await companyWithAddress();
    const { order } = await confirmedOrder(c);
    await pushOrder(db, odoo, order.id);
    await db.order.update({ where: { id: order.id }, data: { odooOrderId: null } });
    await pushOrder(db, odoo, order.id);
    expect(odoo.tables["sale.order"]).toHaveLength(1);
  });
});

describe("task queue", () => {
  it("is fed by approvals, confirmations and cancellations", async () => {
    const c = await companyWithAddress();
    await db.company.update({ where: { id: c.company.id }, data: { status: "PENDING" } });
    const { actor: admin } = await createStaff("ADMIN");
    await approveCompany(db, admin, c.company.id, { tierId: ref.standard.id, regionId: ref.fiji.id, creditLimit: 1000, paymentTermsDays: 30, salesRepId: null });
    const { order, ops } = await confirmedOrder(c);
    await processOdooTasks(db, odoo);
    expect((await db.odooSyncTask.findMany({ orderBy: { createdAt: "asc" } })).map((t) => [t.kind, t.status])).toEqual([
      ["PARTNER_PUSH", "DONE"],
      ["ORDER_PUSH", "DONE"],
    ]);

    await cancelOrder(db, ops, order.id, "Customer changed their mind");
    await processOdooTasks(db, odoo);
    expect(odoo.tables["sale.order"][0].state).toBe("cancel");
  });

  it("does nothing when Odoo isn't configured", async () => {
    delete process.env.ODOO_URL;
    const { company } = await companyWithAddress();
    expect(await enqueueOdoo(db, "PARTNER_PUSH", company.id)).toBe(false);
    expect(await db.odooSyncTask.count()).toBe(0);
  });

  it("retries temporary errors and stops on permanent ones", async () => {
    const { company } = await companyWithAddress();
    await enqueueOdoo(db, "PARTNER_PUSH", company.id);
    odoo.failNext = new Error("ECONNRESET");
    await processOdooTasks(db, odoo);
    let task = await db.odooSyncTask.findFirstOrThrow();
    expect(task).toMatchObject({ status: "PENDING", attempts: 1, lastError: "ECONNRESET" });
    expect(task.runAfter.getTime()).toBeGreaterThan(Date.now());

    await db.odooSyncTask.update({ where: { id: task.id }, data: { runAfter: new Date() } });
    odoo.failNext = new OdooError("AccessError: not allowed", 403, true);
    await processOdooTasks(db, odoo);
    task = await db.odooSyncTask.findFirstOrThrow();
    expect(task.status).toBe("FAILED");
  });
});

describe("accounting pull", () => {
  it("stores invoices and payments, marks paid orders and uses Odoo's balance for credit", async () => {
    const c = await companyWithAddress();
    const { order } = await confirmedOrder(c);
    await pushOrder(db, odoo, order.id);
    const partnerId = (await db.company.findUniqueOrThrow({ where: { id: c.company.id } })).odooPartnerId!;
    const saleName = odoo.tables["sale.order"][0].name as string;

    const p = odoo.tables["res.partner"][0];
    p.credit = 380;
    odoo.tables["account.move"].push(
      { id: 1, name: "INV/2026/0001", move_type: "out_invoice", invoice_date: "2026-08-01", invoice_date_due: "2026-08-31", amount_total: 400, amount_residual: 380, payment_state: "partial", invoice_origin: "S99999", partner_id: [partnerId, "Bula Mart"], state: "posted" },
      { id: 2, name: "INV/2026/0002", move_type: "out_invoice", invoice_date: "2026-10-05", invoice_date_due: "2026-11-04", amount_total: 230, amount_residual: 0, payment_state: "paid", invoice_origin: saleName, partner_id: [partnerId, "Bula Mart"], state: "posted" },
    );
    odoo.tables["account.payment"].push({ id: 7, date: "2026-10-06", amount: 230, memo: "MP-1234", journal_id: [3, "M-PAiSA"], partner_id: [partnerId, "Bula Mart"], payment_type: "inbound", state: "paid" });

    expect(await pullAccounting(db, odoo)).toEqual({ companies: 1, invoices: 2, payments: 1 });

    const invoices = await db.odooInvoice.findMany({ orderBy: { odooId: "asc" } });
    expect(invoices.map((i) => [i.number, i.paymentState, i.orderId])).toEqual([
      ["INV/2026/0001", "partial", null],
      ["INV/2026/0002", "paid", order.id],
    ]);
    expect(invoices[0].portalPath).toBe("/my/invoices/1?access_token=tok1");
    expect(await db.odooPayment.findFirstOrThrow()).toMatchObject({ reference: "MP-1234", journal: "M-PAiSA" });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ paymentStatus: "PAID", odooInvoiced: true });

    const credit = await creditAvailable(db, c.company.id);
    expect(credit).toMatchObject({ source: "odoo", usedCents: 38_000, availableCents: 62_000, overdueCents: 38_000 });
  });
});

describe("transports", () => {
  async function server(handler: (path: string, headers: Record<string, unknown>, body: unknown) => [number, unknown]) {
    const seen: { path: string; headers: Record<string, unknown>; body: unknown }[] = [];
    const srv = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw || "null");
        seen.push({ path: req.url!, headers: req.headers, body });
        const [status, out] = handler(req.url!, req.headers, body);
        res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(out));
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    return { url, seen, close: () => new Promise((r) => srv.close(r)) };
  }

  it("JSON-2 sends bearer key, database header and named args", async () => {
    const s = await server(() => [200, [{ id: 1, name: "Co" }]]);
    try {
      const t = new Json2Transport({ url: s.url, db: "vitico", apiKey: "secret", protocol: "json2" });
      expect(await t.call("res.partner", "search_read", { domain: [["id", "=", 1]], fields: ["name"] })).toEqual([{ id: 1, name: "Co" }]);
      expect(s.seen[0]).toMatchObject({
        path: "/json/2/res.partner/search_read",
        headers: expect.objectContaining({ authorization: "bearer secret", "x-odoo-database": "vitico" }),
        body: { domain: [["id", "=", 1]], fields: ["name"] },
      });
    } finally {
      await s.close();
    }
  });

  it("JSON-2 maps errors, marking client errors permanent", async () => {
    const s = await server(() => [403, { name: "odoo.exceptions.AccessError", message: "You are not allowed" }]);
    try {
      const t = new Json2Transport({ url: s.url, db: "vitico", apiKey: "x", protocol: "json2" });
      const err = (await t.call("res.partner", "write", { ids: [1], vals: {} }).catch((e: unknown) => e)) as OdooError;
      expect(err).toBeInstanceOf(OdooError);
      expect(err).toMatchObject({ status: 403, permanent: true });
      expect(err.message).toContain("You are not allowed");
    } finally {
      await s.close();
    }
  });

  it("legacy JSON-RPC authenticates once then calls execute_kw", async () => {
    const s = await server((_, __, body) => {
      const p = (body as { params: { service: string; args: unknown[] } }).params;
      return [200, { jsonrpc: "2.0", id: 1, result: p.service === "common" ? 7 : [{ id: 3 }] }];
    });
    try {
      const t = new JsonRpcTransport({ url: s.url, db: "vitico", apiKey: "k", username: "api@vitico.test", protocol: "jsonrpc" });
      await t.call("sale.order", "action_confirm", { ids: [3] });
      await t.call("res.partner", "search_read", { domain: [], fields: ["name"] });
      expect(s.seen).toHaveLength(3);
      expect((s.seen[0].body as { params: { args: unknown[] } }).params.args).toEqual(["vitico", "api@vitico.test", "k", {}]);
      expect((s.seen[1].body as { params: { args: unknown[] } }).params.args).toEqual(["vitico", 7, "k", "sale.order", "action_confirm", [[3]], {}]);
    } finally {
      await s.close();
    }
  });

  it("reads config from the environment", () => {
    expect(odooConfigFromEnv({})).toBeNull();
    expect(odooConfigFromEnv({ ODOO_URL: "u", ODOO_DB: "d", ODOO_API_KEY: "k", ODOO_PROTOCOL: "jsonrpc" })).toMatchObject({ protocol: "jsonrpc" });
  });
});
