import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentMethod } from "@vitico/db";
import { APP_URL } from "@/lib/env";
import { runScheduled } from "@/server/jobs";
import { RETRY_DELAYS_MIN, processOutbox } from "@/server/notifications/deliver";
import { notify } from "@/server/notifications/notify";
import { PermanentDeliveryError, type Providers } from "@/server/notifications/providers";
import { addToCart } from "@/server/orders/cart";
import { placeOrder } from "@/server/orders/orders";
import { savePreferences } from "@/server/services/profile";
import { inviteCompanyUser, requestPasswordReset } from "@/server/services/users";
import { createCategory, createCompany, createProduct, createStaff, db, resetDb, seedReference } from "./db";

let ref: Awaited<ReturnType<typeof seedReference>>;
beforeEach(async () => {
  await resetDb();
  ref = await seedReference();
});

const outbox = () => db.outboundMessage.findMany({ orderBy: { createdAt: "asc" } });

function fakeProviders(): Providers & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    email: async (to, subject) => void sent.push(`email:${to}:${subject}`),
    sms: async (to, text) => void sent.push(`sms:${to}:${text}`),
    push: async (sub, p) => void sent.push(`push:${sub.endpoint}:${p.title}`),
  };
}

describe("notify", () => {
  it("creates an in-app notification and queues email by default, with the user's first name", async () => {
    const { owner } = await createCompany(ref);
    await db.user.update({ where: { id: owner.id }, data: { name: "Vikash Naidu" } });
    await notify(db, { type: "account.approved", userIds: [owner.id], vars: { company: "Bula Mart" }, link: "/portal" });
    const inApp = await db.notification.findMany({ where: { userId: owner.id } });
    expect(inApp).toHaveLength(1);
    expect(inApp[0]).toMatchObject({ title: "Your VITICO Wholesale account is ready", link: "/portal" });
    expect(inApp[0].body).toContain("Bula Vikash, Bula Mart has been approved");
    const msgs = await outbox();
    expect(msgs.map((m) => m.channel)).toEqual(["EMAIL"]);
    expect(msgs[0].link).toBe(`${APP_URL}/portal`);
  });

  it("follows preferences: SMS only with a valid phone, push per device", async () => {
    const { owner } = await createCompany(ref);
    await db.user.update({ where: { id: owner.id }, data: { phone: "+679 912 3456" } });
    await savePreferences(db, owner.id, [{ category: "orders", email: false, sms: true, push: true }]);
    await db.pushSubscription.createMany({
      data: [
        { userId: owner.id, endpoint: "https://push.example/1", p256dh: "p".repeat(20), auth: "a".repeat(10) },
        { userId: owner.id, endpoint: "https://push.example/2", p256dh: "p".repeat(20), auth: "a".repeat(10) },
      ],
    });
    await notify(db, { type: "order.placed", userIds: [owner.id], vars: { order: "VIT-001001", total: "FJD 10.00" } });
    const msgs = await outbox();
    expect(msgs.map((m) => m.channel).sort()).toEqual(["PUSH", "PUSH", "SMS"]);
    expect(msgs.find((m) => m.channel === "SMS")?.to).toBe("+6799123456");
  });

  it("always emails invites, even to users who aren't active yet, and admins can override wording", async () => {
    await db.messageTemplate.create({ data: { type: "user.invited", subject: "Join {{company}}!", body: "Hi {{name}}: {{link}}" } });
    const { actor } = await createCompany(ref, { name: "Bula Mart" });
    const { user } = await inviteCompanyUser(db, actor, { name: "Losana Waqa", email: "losana@t.test", role: "PURCHASING", orderLimit: null });
    const msgs = await outbox();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ channel: "EMAIL", to: "losana@t.test", subject: "Join Bula Mart!" });
    expect(msgs[0].body.startsWith(`Hi Losana: ${APP_URL}/set-password/`)).toBe(true);
    expect(await db.notification.count({ where: { userId: user.id } })).toBe(0);
  });

  it("skips disabled users", async () => {
    const { owner } = await createCompany(ref);
    await db.user.update({ where: { id: owner.id }, data: { status: "DISABLED" } });
    await notify(db, { type: "order.placed", userIds: [owner.id], vars: {} });
    expect(await outbox()).toHaveLength(0);
  });
});

describe("order notifications", () => {
  it("tells the customer and the right staff about a new order", async () => {
    const company = await createCompany(ref);
    const { user: rep } = await createStaff("SALES_REP");
    const { user: ops } = await createStaff("ADMIN");
    const { user: pricing } = await createStaff("PRICING_MANAGER");
    await db.company.update({ where: { id: company.company.id }, data: { salesRepId: rep.id } });
    await db.address.create({ data: { companyId: company.company.id, label: "Shop", line1: "1", city: "Nadi", regionId: ref.fiji.id, isDefault: true } });
    const cat = await createCategory();
    const p = await createProduct(cat.id, { onHand: 5 });
    const owner = { userId: company.owner.id, companyId: company.company.id, isStaff: false };
    await addToCart(db, owner, p.id, 1);
    const order = await placeOrder(db, owner, { kind: "customer", actor: company.actor, orderLimitCents: null }, PaymentMethod.BANK_DEPOSIT);

    const inApp = await db.notification.findMany();
    const typesFor = (id: string) => inApp.filter((n) => n.userId === id).map((n) => n.type);
    expect(typesFor(company.owner.id)).toEqual(["order.placed"]);
    expect(typesFor(ops.id)).toEqual(["staff.order_new"]);
    expect(typesFor(rep.id)).toEqual(["staff.order_new"]);
    expect(typesFor(pricing.id)).toEqual([]);
    expect(inApp.find((n) => n.userId === ops.id)?.title).toContain(order.number);
  });
});

describe("processOutbox", () => {
  async function queue(channel: "EMAIL" | "SMS" | "PUSH" = "EMAIL", to = "a@t.test") {
    return db.outboundMessage.create({ data: { channel, to, subject: "Hi", body: "Body", type: "test" } });
  }

  it("sends due messages and marks them sent", async () => {
    await queue();
    const providers = fakeProviders();
    expect(await processOutbox(db, providers)).toBe(1);
    expect(providers.sent).toEqual(["email:a@t.test:Hi"]);
    expect((await outbox())[0]).toMatchObject({ status: "SENT", attempts: 1 });
    expect(await processOutbox(db, providers)).toBe(0);
  });

  it("retries with backoff, then gives up", async () => {
    const m = await queue();
    const failing: Providers = { ...fakeProviders(), email: async () => { throw new Error("SES throttled"); } };
    await processOutbox(db, failing);
    let row = await db.outboundMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, lastError: "SES throttled" });
    expect(row.sendAfter.getTime()).toBeGreaterThan(Date.now() + 50_000);

    await db.outboundMessage.update({ where: { id: m.id }, data: { attempts: RETRY_DELAYS_MIN.length, sendAfter: new Date() } });
    await processOutbox(db, failing);
    row = await db.outboundMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.status).toBe("FAILED");
  });

  it("drops expired push subscriptions", async () => {
    const { owner } = await createCompany(ref);
    const sub = await db.pushSubscription.create({ data: { userId: owner.id, endpoint: "https://push.example/x", p256dh: "p".repeat(20), auth: "a".repeat(10) } });
    await queue("PUSH", sub.id);
    const gone: Providers = { ...fakeProviders(), push: async () => { throw new PermanentDeliveryError("410"); } };
    await processOutbox(db, gone);
    expect((await outbox())[0].status).toBe("FAILED");
    expect(await db.pushSubscription.count()).toBe(0);
  });

  it("never sends a message twice when workers run in parallel", async () => {
    for (let i = 0; i < 30; i++) await queue("EMAIL", `u${i}@t.test`);
    const providers = fakeProviders();
    await Promise.all([processOutbox(db, providers, 10), processOutbox(db, providers, 10), processOutbox(db, providers, 10), processOutbox(db, providers, 10)]);
    expect(new Set(providers.sent).size).toBe(providers.sent.length);
    expect(providers.sent).toHaveLength(30);
  });
});

describe("forgot password", () => {
  it("emails active users, is silent for unknown emails, and is rate-limited", async () => {
    const { owner } = await createCompany(ref);
    await requestPasswordReset(db, "nobody@t.test");
    expect(await outbox()).toHaveLength(0);
    for (let i = 0; i < 5; i++) await requestPasswordReset(db, owner.email);
    const msgs = await outbox();
    expect(msgs).toHaveLength(3);
    expect(msgs[0].subject).toBe("Reset your VITICO Wholesale password");
  });
});

describe("runScheduled", () => {
  it("runs a job once per interval across callers", async () => {
    const fn = vi.fn(async () => {});
    const now = new Date("2026-10-06T00:00:00Z");
    const results = await Promise.all([runScheduled(db, "t", 60_000, fn, now), runScheduled(db, "t", 60_000, fn, now)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await runScheduled(db, "t", 60_000, fn, new Date(now.getTime() + 30_000))).toBe(false);
    expect(await runScheduled(db, "t", 60_000, fn, new Date(now.getTime() + 61_000))).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
