import { type Db, type PaymentMethod, type Prisma, OrderType } from "@vitico/db";
import type { Placer } from "../orders/orders";
import { assertCanPlace, assertStaffScope, createOrderFromPriced } from "../orders/orders";
import { priceItems, qtyProblem } from "../orders/cart";
import { companyScope } from "../services/companies";
import type { StaffActor } from "../actors";
import { ServiceError } from "../errors";
import { staffCan } from "@/lib/auth/permissions";

type Tx = Db | Prisma.TransactionClient;

export const WARN_AT_PERCENT = 90;

/** Fill level of a container; over 100% on either measure blocks submission. */
export function capacity(cbm: number, weightKg: number, type: { maxCbm: number; maxWeightKg: number }) {
  const cbmPct = (cbm / type.maxCbm) * 100;
  const weightPct = (weightKg / type.maxWeightKg) * 100;
  const fullest = Math.max(cbmPct, weightPct);
  return {
    cbm,
    weightKg,
    cbmPct,
    weightPct,
    remainingCbm: type.maxCbm - cbm,
    remainingKg: type.maxWeightKg - weightKg,
    over: cbmPct > 100 || weightPct > 100,
    warning: fullest >= WARN_AT_PERCENT && fullest <= 100,
    limitedBy: cbmPct >= weightPct ? ("volume" as const) : ("weight" as const),
  };
}

// ─── Access ──────────────────────────────────────────────────────────────────

/** Who is working on builds: a customer (own company only) or staff (their customer scope). */
export type BuildAccess = { kind: "customer"; userId: string; companyId: string } | { kind: "staff"; userId: string; actor: StaffActor };

function buildWhere(access: BuildAccess): Prisma.ContainerBuildWhereInput {
  return access.kind === "customer" ? { companyId: access.companyId } : { company: companyScope(access.actor) };
}

async function loadDraft(tx: Tx, access: BuildAccess, buildId: string) {
  const build = await tx.containerBuild.findFirst({ where: { id: buildId, ...buildWhere(access) } });
  if (!build) throw new ServiceError("Container not found.");
  if (build.status !== "DRAFT") throw new ServiceError("This container has already been ordered.");
  return build;
}

async function assertTypeForRegion(tx: Tx, containerTypeId: string, regionId: string) {
  const [type, region] = await Promise.all([
    tx.containerType.findFirst({ where: { id: containerTypeId, active: true } }),
    tx.region.findFirst({ where: { id: regionId, active: true } }),
  ]);
  if (!type) throw new ServiceError("Choose a container size.", "containerTypeId");
  if (!region) throw new ServiceError("Choose a destination.", "destinationRegionId");
  if (type.allowedRegionIds.length) {
    // A region qualifies if it or one of its parents is allowed.
    const all = await tx.region.findMany({ select: { id: true, parentId: true } });
    const byId = new Map(all.map((r) => [r.id, r]));
    let ok = false;
    for (let r = byId.get(region.id); r; r = r.parentId ? byId.get(r.parentId) : undefined) if (type.allowedRegionIds.includes(r.id)) ok = true;
    if (!ok) throw new ServiceError(`${type.name} containers can't ship to ${region.name}.`, "containerTypeId");
  }
  return { type, region };
}

// ─── Builds ──────────────────────────────────────────────────────────────────

export async function createBuild(
  db: Db,
  access: BuildAccess,
  input: { companyId: string; name: string; containerTypeId: string; destinationRegionId: string },
) {
  if (access.kind === "customer" && access.companyId !== input.companyId) throw new ServiceError("Not allowed.");
  if (access.kind === "staff") {
    const ok = await db.company.findFirst({ where: { id: input.companyId, status: "ACTIVE", ...companyScope(access.actor) } });
    if (!ok) throw new ServiceError("You can only build containers for your own customers.");
  }
  await assertTypeForRegion(db, input.containerTypeId, input.destinationRegionId);
  const address = await db.address.findFirst({ where: { companyId: input.companyId, regionId: input.destinationRegionId }, orderBy: { isDefault: "desc" } });
  return db.containerBuild.create({ data: { ...input, createdById: access.userId, addressId: address?.id ?? null } });
}

export async function updateBuild(
  db: Db,
  access: BuildAccess,
  buildId: string,
  input: { name: string; containerTypeId: string; destinationRegionId: string; addressId: string | null; poNumber: string | null; notes: string | null; requestedDate: Date | null },
) {
  const build = await loadDraft(db, access, buildId);
  await assertTypeForRegion(db, input.containerTypeId, input.destinationRegionId);
  if (input.addressId && !(await db.address.findFirst({ where: { id: input.addressId, companyId: build.companyId } }))) {
    throw new ServiceError("Choose one of the customer's addresses.", "addressId");
  }
  await db.containerBuild.update({ where: { id: buildId }, data: input });
}

async function eligibleProduct(tx: Tx, productId: string) {
  const p = await tx.product.findFirst({ where: { id: productId, active: true, category: { active: true } } });
  if (!p) throw new ServiceError("This product isn't available.");
  if (!p.containerEligible) throw new ServiceError(`${p.name} can't be shipped in a dry container.`);
  return p;
}

/** Sets quantities for several products at once; 0 removes a line. */
export async function setBuildLines(db: Db, access: BuildAccess, buildId: string, entries: { productId: string; qty: number }[]) {
  await loadDraft(db, access, buildId);
  const errors: string[] = [];
  for (const { productId, qty } of entries) {
    if (qty === 0) {
      await db.containerBuildLine.deleteMany({ where: { buildId, productId } });
      continue;
    }
    try {
      const p = await eligibleProduct(db, productId);
      const problem = qtyProblem(p, qty);
      if (problem) {
        errors.push(`${p.name}: ${problem}`);
        continue;
      }
      await db.containerBuildLine.upsert({ where: { buildId_productId: { buildId, productId } }, update: { qty }, create: { buildId, productId, qty } });
    } catch (e) {
      if (e instanceof ServiceError) errors.push(e.message);
      else throw e;
    }
  }
  if (errors.length) throw new ServiceError(errors.join(" "));
  await db.containerBuild.update({ where: { id: buildId }, data: { updatedAt: new Date() } });
}

export async function addSkuToBuild(db: Db, access: BuildAccess, buildId: string, sku: string, qty: number) {
  const product = await db.product.findUnique({ where: { sku: sku.trim().toUpperCase() } });
  if (!product) throw new ServiceError(`No product with SKU ${sku}.`, "sku");
  const existing = await db.containerBuildLine.findUnique({ where: { buildId_productId: { buildId, productId: product.id } } });
  await setBuildLines(db, access, buildId, [{ productId: product.id, qty: (existing?.qty ?? 0) + qty }]);
}

export async function setBuildOverride(db: Db, access: BuildAccess, buildId: string, productId: string, price: number | null, reason: string | null) {
  if (access.kind !== "staff") throw new ServiceError("Only VITICO staff can set a manual price.");
  if (price !== null && (!reason || reason.trim().length < 3)) throw new ServiceError("Give a reason for the manual price.", "reason");
  await loadDraft(db, access, buildId);
  await db.containerBuildLine.updateMany({ where: { buildId, productId }, data: { overridePrice: price, overrideReason: price === null ? null : reason } });
}

export async function deleteBuild(db: Db, access: BuildAccess, buildId: string) {
  await loadDraft(db, access, buildId);
  await db.containerBuild.delete({ where: { id: buildId } });
}

/** The build priced for its destination, with fill levels. */
export async function priceBuild(tx: Tx, buildId: string) {
  const build = await tx.containerBuild.findUniqueOrThrow({
    where: { id: buildId },
    include: {
      containerType: true,
      destinationRegion: true,
      address: true,
      company: true,
      lines: { include: { product: { include: { stock: true, category: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  const priced = await priceItems(tx, {
    companyId: build.companyId,
    regionId: build.destinationRegionId,
    items: build.lines.map((l) => ({ id: l.productId, product: l.product, qty: l.qty, overridePrice: l.overridePrice, overrideReason: l.overrideReason })),
  });
  for (const l of priced.lines) if (!l.product.containerEligible) l.problems.push("Not allowed in a dry container.");
  const fill = capacity(priced.cbm, priced.weightKg, { maxCbm: Number(build.containerType.maxCbm), maxWeightKg: Number(build.containerType.maxWeightKg) });
  return { build, ...priced, hasProblems: priced.hasProblems || priced.lines.some((l) => l.problems.length > 0), fill };
}

export type PricedBuild = Awaited<ReturnType<typeof priceBuild>>;

/** Orders the container: capacity must be within limits; the build becomes read-only. */
export async function submitBuild(db: Db, access: BuildAccess, buildId: string, placer: Placer, paymentMethod: PaymentMethod, opts: { rebateCents?: number } = {}) {
  assertCanPlace(placer, paymentMethod);
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ContainerBuild" WHERE id = ${buildId} FOR UPDATE`;
      const draft = await loadDraft(tx, access, buildId);
      await assertStaffScope(tx, placer, draft.companyId);
      const priced = await priceBuild(tx, buildId);
      const { build, fill } = priced;
      if (priced.lines.length === 0) throw new ServiceError("The container is empty.");
      if (fill.over) {
        throw new ServiceError(
          `The container is over its limit (${fill.cbmPct.toFixed(0)}% of volume, ${fill.weightPct.toFixed(0)}% of weight). Remove some cartons or choose a bigger container.`,
        );
      }
      const order = await createOrderFromPriced(
        tx,
        {
          ...priced,
          company: build.company,
          regionId: build.destinationRegionId,
          delivery: {
            pickup: false,
            address: build.address ?? { label: `${build.containerType.name} to ${build.destinationRegion.name}`, line1: `Port of discharge, ${build.destinationRegion.name}`, line2: null, city: build.destinationRegion.name },
            poNumber: build.poNumber,
            notes: [`Container: ${build.containerType.name} (${build.name})`, build.notes].filter(Boolean).join("\n"),
            requestedDate: build.requestedDate,
          },
        },
        placer,
        paymentMethod,
        {
          rebateCents: opts.rebateCents,
          extra: { type: OrderType.CONTAINER, containerTypeId: build.containerTypeId, containerCbm: fill.cbm, containerWeightKg: fill.weightKg },
        },
      );
      await tx.containerBuild.update({ where: { id: buildId }, data: { status: "SUBMITTED", orderId: order.id } });
      return order;
    },
    { timeout: 30_000 },
  );
}

// ─── Admin: container types ──────────────────────────────────────────────────

export async function saveContainerType(
  db: Db,
  actor: StaffActor,
  input: { code: string; name: string; maxCbm: number; maxWeightKg: number; active: boolean; sortOrder: number; allowedRegionIds: string[] },
  id?: string,
) {
  if (!staffCan(actor.staffRole, "catalogue.manage")) throw new ServiceError("You can't edit container types.");
  const clash = await db.containerType.findFirst({ where: { code: input.code, ...(id && { id: { not: id } }) } });
  if (clash) throw new ServiceError("That code is already used.", "code");
  return id ? db.containerType.update({ where: { id }, data: input }) : db.containerType.create({ data: input });
}
