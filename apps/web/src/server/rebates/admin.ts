import { toCents } from "@vitico/pricing";
import type { Db, Prisma, RebatePeriod, RebateType } from "@vitico/db";
import { staffCan } from "@/lib/auth/permissions";
import type { StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import type { Step } from "./calc";
import { SPEND_STATUSES } from "./service";

export type RebateRuleInput = {
  name: string;
  description: string | null;
  type: RebateType;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  tierIds: string[];
  companyId: string | null;
  period: RebatePeriod | null;
  steps: Step[];
  percent: number | null;
  categoryIds: string[];
  skus: string[];
  earlyPaymentDays: number | null;
  expiryDays: number | null;
};

export async function saveRebateRule(db: Db, actor: StaffActor, input: RebateRuleInput, id?: string) {
  if (!staffCan(actor.staffRole, "rebates.manage")) throw new ServiceError("You can't manage rebates.");
  const need = (ok: boolean, msg: string, field: string) => {
    if (!ok) throw new ServiceError(msg, field);
  };
  if (input.type === "SPEND_TARGET") {
    need(!!input.period, "Choose a period.", "period");
    need(input.steps.length > 0, "Add at least one spend step.", "steps");
  } else {
    need(input.percent !== null && input.percent > 0, "Enter the rebate %.", "percent");
  }
  if (input.type === "CONTRACT") {
    need(!!input.companyId, "Contract rebates are for one customer.", "companyId");
    need(!!input.period, "Choose the settlement period.", "period");
  }
  if (input.type === "EARLY_PAYMENT") need(input.earlyPaymentDays !== null && input.earlyPaymentDays >= 0, "Enter the number of days.", "earlyPaymentDays");
  if (input.skus.length) {
    const found = await db.product.findMany({ where: { sku: { in: input.skus } }, select: { sku: true } });
    const missing = input.skus.filter((s) => !found.some((f) => f.sku === s));
    need(missing.length === 0, `Unknown SKU(s): ${missing.join(", ")}`, "skus");
  }
  const data = {
    ...input,
    steps: input.type === "SPEND_TARGET" ? (input.steps as unknown as Prisma.InputJsonValue) : undefined,
    percent: input.type === "SPEND_TARGET" ? null : input.percent,
    period: input.type === "SPEND_TARGET" || input.type === "CONTRACT" ? input.period : null,
    earlyPaymentDays: input.type === "EARLY_PAYMENT" ? input.earlyPaymentDays : null,
    categoryIds: input.type === "CASHBACK" ? input.categoryIds : [],
    skus: input.type === "CASHBACK" ? input.skus : [],
  };
  const rule = id ? await db.rebateRule.update({ where: { id }, data }) : await db.rebateRule.create({ data });
  await audit(db, { actorId: actor.id, action: id ? "rebate_rule.updated" : "rebate_rule.created", entityType: "RebateRule", entityId: rule.id, data: { name: input.name, type: input.type } });
  return rule;
}

/** Customers whose trailing-12-month spend puts them in a different tier. */
export async function tierSuggestions(db: Db, now = new Date()) {
  const tiers = (await db.tier.findMany({ orderBy: { sortOrder: "asc" } })).filter((t) => t.minAnnualSpend !== null);
  if (tiers.length === 0) return [];
  const since = new Date(now.getTime() - 365 * 86_400_000);
  const spend = await db.order.groupBy({ by: ["companyId"], where: { status: { in: SPEND_STATUSES }, submittedAt: { gte: since } }, _sum: { subtotal: true } });
  const spendBy = new Map(spend.map((s) => [s.companyId, toCents(s._sum.subtotal ?? 0)]));
  const companies = await db.company.findMany({ where: { status: "ACTIVE" }, include: { tier: true } });
  const out = [];
  for (const c of companies) {
    const cents = spendBy.get(c.id) ?? 0;
    const best = [...tiers].sort((a, b) => Number(b.minAnnualSpend) - Number(a.minAnnualSpend)).find((t) => cents >= toCents(t.minAnnualSpend!));
    if (best && best.id !== c.tierId) out.push({ company: c, spendCents: cents, suggested: best, upgrade: Number(best.minAnnualSpend) > Number(c.tier.minAnnualSpend ?? 0) });
  }
  return out.sort((a, b) => b.spendCents - a.spendCents);
}
