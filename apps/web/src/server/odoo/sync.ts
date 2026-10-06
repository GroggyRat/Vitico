import { type Db, type Prisma, OdooTaskKind, PaymentStatus } from "@vitico/db";
import type { OdooTransport } from "./client";
import { OdooError } from "./client";

type Tx = Db | Prisma.TransactionClient;

// ─── Queue ───────────────────────────────────────────────────────────────────

export const odooEnabled = () => !!(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_API_KEY);

/**
 * Queues a change for Odoo. Call inside the transaction that made the change.
 * No-op (returns false) when Odoo isn't configured; skips duplicates already pending.
 */
export async function enqueueOdoo(tx: Tx, kind: OdooTaskKind, entityId: string, force = false) {
  if (!force && !odooEnabled()) return false;
  const pending = await tx.odooSyncTask.findFirst({ where: { kind, entityId, status: "PENDING" } });
  if (pending) return false;
  await tx.odooSyncTask.create({ data: { kind, entityId } });
  return true;
}

export const RETRY_DELAYS_MIN = [1, 5, 15, 60, 240, 720];

export async function processOdooTasks(db: Db, odoo: OdooTransport, batch = 20) {
  const tasks = await db.$queryRaw<{ id: string; kind: OdooTaskKind; entityId: string; attempts: number }[]>`
    UPDATE "OdooSyncTask" SET status = 'RUNNING', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "OdooSyncTask" WHERE status = 'PENDING' AND "runAfter" <= now()
      ORDER BY "createdAt" LIMIT ${batch} FOR UPDATE SKIP LOCKED)
    RETURNING id, kind, "entityId", attempts`;
  for (const t of tasks) {
    try {
      if (t.kind === "PARTNER_PUSH") await pushPartner(db, odoo, t.entityId);
      else if (t.kind === "ORDER_PUSH") await pushOrder(db, odoo, t.entityId);
      else await cancelOdooOrder(db, odoo, t.entityId);
      await db.odooSyncTask.update({ where: { id: t.id }, data: { status: "DONE", doneAt: new Date(), lastError: null } });
    } catch (e) {
      const delay = RETRY_DELAYS_MIN[t.attempts - 1];
      const permanent = e instanceof OdooError && e.permanent;
      await db.odooSyncTask.update({
        where: { id: t.id },
        data: {
          status: permanent || delay === undefined ? "FAILED" : "PENDING",
          lastError: String(e instanceof Error ? e.message : e).slice(0, 2000),
          ...(delay !== undefined && { runAfter: new Date(Date.now() + delay * 60_000) }),
        },
      });
    }
  }
  return tasks.length;
}

// ─── Lookups (cached per call) ───────────────────────────────────────────────

async function countryId(odoo: OdooTransport, code: string): Promise<number | false> {
  const rows = await odoo.call<{ id: number }[]>("res.country", "search_read", { domain: [["code", "=", code]], fields: ["id"], limit: 1 });
  return rows[0]?.id ?? false;
}

// ─── Partners (portal → Odoo) ────────────────────────────────────────────────

/**
 * Creates or updates the customer's res.partner. The portal owns name/contact
 * details; Odoo owns accounting. `ref` holds our company id so retries never duplicate.
 */
export async function pushPartner(db: Db, odoo: OdooTransport, companyId: string): Promise<number> {
  const company = await db.company.findUniqueOrThrow({
    where: { id: companyId },
    include: { region: true, addresses: { where: { isDefault: true }, include: { region: true } } },
  });
  const address = company.addresses[0];
  const vals = {
    name: company.name,
    is_company: true,
    ref: `VIT:${company.id}`,
    email: company.email,
    phone: company.phone || false,
    vat: company.taxNumber || false,
    street: address?.line1 ?? false,
    street2: address?.line2 ?? false,
    city: address?.city ?? false,
    country_id: await countryId(odoo, (address?.region ?? company.region).countryCode),
    customer_rank: 1,
    comment: company.tradingName ? `Trading as ${company.tradingName}` : false,
  };

  let partnerId = company.odooPartnerId;
  if (!partnerId) {
    const found = await odoo.call<{ id: number }[]>("res.partner", "search_read", { domain: [["ref", "=", vals.ref]], fields: ["id"], limit: 1 });
    partnerId = found[0]?.id ?? null;
  }
  if (partnerId) {
    await odoo.call("res.partner", "write", { ids: [partnerId], vals });
  } else {
    const created = await odoo.call<number[] | number>("res.partner", "create", { vals_list: [vals] });
    partnerId = Array.isArray(created) ? created[0] : created;
  }
  if (company.odooPartnerId !== partnerId) await db.company.update({ where: { id: companyId }, data: { odooPartnerId: partnerId } });
  return partnerId;
}

// ─── Orders (portal → Odoo) ──────────────────────────────────────────────────

/** Finds the Odoo product by SKU (default_code), creating a basic one if missing. */
async function productId(odoo: OdooTransport, line: { sku: string; name: string; unitPrice: Prisma.Decimal }) {
  const rows = await odoo.call<{ id: number }[]>("product.product", "search_read", {
    domain: [["default_code", "=", line.sku]],
    fields: ["id"],
    limit: 1,
    context: { active_test: false },
  });
  if (rows[0]) return rows[0].id;
  if (process.env.ODOO_CREATE_MISSING_PRODUCTS === "0") throw new OdooError(`No Odoo product with internal reference ${line.sku}.`, undefined, true);
  const created = await odoo.call<number[] | number>("product.product", "create", {
    vals_list: [{ name: line.name, default_code: line.sku, list_price: Number(line.unitPrice), sale_ok: true }],
  });
  return Array.isArray(created) ? created[0] : created;
}

/** Creates and confirms the sale.order for a VITICO order. Idempotent via `origin`. */
export async function pushOrder(db: Db, odoo: OdooTransport, orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true, company: true } });
  if (order.odooOrderId) return order.odooOrderId;
  if (order.status === "CANCELLED") return null;
  const partnerId = order.company.odooPartnerId ?? (await pushPartner(db, odoo, order.companyId));

  const existing = await odoo.call<{ id: number; name: string }[]>("sale.order", "search_read", {
    domain: [["origin", "=", order.number]],
    fields: ["id", "name"],
    limit: 1,
  });
  let saleId = existing[0]?.id;
  let saleName = existing[0]?.name;
  if (!saleId) {
    const lines = [];
    for (const l of order.lines) {
      lines.push([0, 0, { product_id: await productId(odoo, l), name: `[${l.sku}] ${l.name} (${l.sellUnit})`, product_uom_qty: l.qty, price_unit: Number(l.unitPrice) }]);
    }
    const note = [
      order.pickup ? "Pickup" : `Deliver to: ${[order.deliveryLabel, order.deliveryLine1, order.deliveryLine2, order.deliveryCity].filter(Boolean).join(", ")}`,
      order.notes,
    ]
      .filter(Boolean)
      .join("\n");
    const created = await odoo.call<number[] | number>("sale.order", "create", {
      vals_list: [
        {
          partner_id: partnerId,
          origin: order.number,
          client_order_ref: order.poNumber || order.number,
          commitment_date: order.requestedDate?.toISOString().slice(0, 19).replace("T", " ") ?? false,
          note,
          order_line: lines,
        },
      ],
    });
    saleId = Array.isArray(created) ? created[0] : created;
    const read = await odoo.call<{ name: string }[]>("sale.order", "read", { ids: [saleId], fields: ["name"] });
    saleName = read[0]?.name;
  }
  await odoo.call("sale.order", "action_confirm", { ids: [saleId] }).catch((e: unknown) => {
    // Already confirmed is fine on retry.
    if (!(e instanceof OdooError) || !/state|confirm/i.test(e.message)) throw e;
  });
  await db.order.update({ where: { id: orderId }, data: { odooOrderId: saleId, odooOrderName: saleName ?? null } });
  return saleId;
}

export async function cancelOdooOrder(db: Db, odoo: OdooTransport, orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (!order.odooOrderId) return;
  await odoo.call("sale.order", "action_cancel", { ids: [order.odooOrderId] });
}

// ─── Accounting (Odoo → portal) ──────────────────────────────────────────────

type OdooMove = {
  id: number;
  name: string;
  move_type: "out_invoice" | "out_refund";
  invoice_date: string | false;
  invoice_date_due: string | false;
  amount_total: number;
  amount_residual: number;
  payment_state: string;
  invoice_origin: string | false;
  partner_id: [number, string] | false;
};

type OdooPaymentRow = { id: number; date: string; amount: number; memo?: string | false; ref?: string | false; journal_id: [number, string] | false; partner_id: [number, string] | false };

const odooDate = (d: string | false) => (d ? new Date(`${d}T00:00:00Z`) : null);

/**
 * Pulls receivable balance, overdue amount, posted invoices / credit notes and payments
 * for every linked customer. Marks on-account orders invoiced / paid from their invoices.
 */
export async function pullAccounting(db: Db, odoo: OdooTransport, opts: { companyIds?: string[] } = {}) {
  const companies = await db.company.findMany({
    where: { odooPartnerId: { not: null }, ...(opts.companyIds && { id: { in: opts.companyIds } }) },
    select: { id: true, odooPartnerId: true },
  });
  if (companies.length === 0) return { companies: 0, invoices: 0, payments: 0 };
  const byPartner = new Map(companies.map((c) => [c.odooPartnerId!, c.id]));
  const partnerIds = [...byPartner.keys()];

  const partners = await odoo.call<{ id: number; credit: number }[]>("res.partner", "read", { ids: partnerIds, fields: ["credit"] });
  const moves = await odoo.call<OdooMove[]>("account.move", "search_read", {
    domain: [
      ["partner_id", "child_of", partnerIds],
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
    ],
    fields: ["name", "move_type", "invoice_date", "invoice_date_due", "amount_total", "amount_residual", "payment_state", "invoice_origin", "partner_id"],
    order: "invoice_date desc",
    limit: 5000,
  });
  const payments = await odoo
    .call<OdooPaymentRow[]>("account.payment", "search_read", {
      domain: [
        ["partner_id", "child_of", partnerIds],
        ["payment_type", "=", "inbound"],
        ["state", "in", ["posted", "paid", "in_process"]],
      ],
      fields: ["date", "amount", "memo", "journal_id", "partner_id"],
      order: "date desc",
      limit: 5000,
    })
    .catch(async (e: unknown) => {
      // Odoo ≤ 17 calls the reference field `ref` rather than `memo`.
      if (!(e instanceof OdooError) || !/memo/.test(e.message)) throw e;
      return odoo.call<OdooPaymentRow[]>("account.payment", "search_read", {
        domain: [["partner_id", "child_of", partnerIds], ["payment_type", "=", "inbound"], ["state", "=", "posted"]],
        fields: ["date", "amount", "ref", "journal_id", "partner_id"],
        order: "date desc",
        limit: 5000,
      });
    });

  // Portal (PDF) links for invoices we haven't stored one for yet.
  const known = new Map((await db.odooInvoice.findMany({ where: { odooId: { in: moves.map((m) => m.id) } }, select: { odooId: true, portalPath: true } })).map((r) => [r.odooId, r.portalPath]));
  const needUrl = moves.filter((m) => !known.get(m.id)).map((m) => m.id);
  const urls = new Map<number, string>();
  for (const id of needUrl.slice(0, 200)) {
    const url = await odoo.call<string>("account.move", "get_portal_url", { ids: [id] }).catch(() => null);
    if (url) urls.set(id, url);
  }

  const orders = await db.order.findMany({ where: { companyId: { in: companies.map((c) => c.id) } }, select: { id: true, number: true, odooOrderName: true, paymentStatus: true } });
  const orderByRef = new Map<string, (typeof orders)[number]>();
  for (const o of orders) {
    orderByRef.set(o.number, o);
    if (o.odooOrderName) orderByRef.set(o.odooOrderName, o);
  }
  const resolveCompany = (p: [number, string] | false) => (p ? byPartner.get(p[0]) : undefined);
  const today = new Date();
  const overdue = new Map<string, number>();

  for (const m of moves) {
    const companyId = resolveCompany(m.partner_id) ?? (companies.length === 1 ? companies[0].id : undefined);
    if (!companyId) continue;
    const order = m.invoice_origin ? m.invoice_origin.split(/,\s*/).map((r) => orderByRef.get(r)).find(Boolean) : undefined;
    const due = odooDate(m.invoice_date_due);
    if (m.move_type === "out_invoice" && m.amount_residual > 0 && due && due < today) {
      overdue.set(companyId, (overdue.get(companyId) ?? 0) + m.amount_residual);
    }
    await db.odooInvoice.upsert({
      where: { odooId: m.id },
      update: {
        amountTotal: m.amount_total,
        amountResidual: m.amount_residual,
        paymentState: m.payment_state,
        dueDate: due,
        orderId: order?.id ?? null,
        syncedAt: today,
        ...(urls.has(m.id) && { portalPath: urls.get(m.id) }),
      },
      create: {
        odooId: m.id,
        companyId,
        number: m.name,
        moveType: m.move_type === "out_refund" ? "CREDIT_NOTE" : "INVOICE",
        invoiceDate: odooDate(m.invoice_date),
        dueDate: due,
        amountTotal: m.amount_total,
        amountResidual: m.amount_residual,
        paymentState: m.payment_state,
        origin: m.invoice_origin || null,
        orderId: order?.id ?? null,
        portalPath: urls.get(m.id) ?? null,
      },
    });
    if (order && m.move_type === "out_invoice") {
      const paid = m.payment_state === "paid" || m.payment_state === "in_payment";
      await db.order.update({
        where: { id: order.id },
        data: { odooInvoiced: true, ...(paid && order.paymentStatus === PaymentStatus.ON_ACCOUNT && { paymentStatus: PaymentStatus.PAID }) },
      });
    }
  }

  for (const p of payments) {
    const companyId = resolveCompany(p.partner_id);
    if (!companyId) continue;
    const data = { date: new Date(`${p.date}T00:00:00Z`), amount: p.amount, reference: (p.memo || p.ref || null) as string | null, journal: p.journal_id ? p.journal_id[1] : null, syncedAt: today };
    await db.odooPayment.upsert({ where: { odooId: p.id }, update: data, create: { odooId: p.id, companyId, ...data } });
  }

  for (const p of partners) {
    const companyId = byPartner.get(p.id);
    if (!companyId) continue;
    await db.company.update({
      where: { id: companyId },
      data: { odooReceivable: p.credit, odooOverdue: overdue.get(companyId) ?? 0, odooSyncedAt: today },
    });
  }
  return { companies: companies.length, invoices: moves.length, payments: payments.length };
}

/** Tests the connection; returns the Odoo version string or throws. */
export async function testConnection(odoo: OdooTransport) {
  const rows = await odoo.call<{ id: number; name: string }[]>("res.company", "search_read", { domain: [], fields: ["name"], limit: 1 });
  return rows[0]?.name ?? "connected";
}
