import { toCents, vatCents } from "@vitico/pricing";
import type { Db, Prisma } from "@vitico/db";
import { ServiceError } from "../errors";
import { createPricer } from "../services/pricing";
import { availableOf } from "../services/stock";

type Tx = Db | Prisma.TransactionClient;

/** Whose cart: a customer user for their company, or a staff member ordering for a customer. */
export type CartOwner = { userId: string; companyId: string; isStaff: boolean };

export function qtyProblem(p: { moq: number; orderMultiple: number; sellUnit: string }, qty: number): string | null {
  if (!Number.isInteger(qty) || qty < 1) return "Enter a whole number of units.";
  if (qty < p.moq) return `Minimum order is ${p.moq}.`;
  if (qty % p.orderMultiple !== 0) return `Order in multiples of ${p.orderMultiple}.`;
  return null;
}

export async function getOrCreateCart(db: Tx, owner: CartOwner) {
  const where = { userId_companyId: { userId: owner.userId, companyId: owner.companyId } };
  const existing = await db.cart.findUnique({ where });
  if (existing) return existing;
  const address = await db.address.findFirst({ where: { companyId: owner.companyId, isDefault: true } });
  // ON CONFLICT DO NOTHING keeps concurrent first requests (e.g. two tabs) from colliding.
  await db.$executeRaw`
    INSERT INTO "Cart" (id, "userId", "companyId", "addressId", "updatedAt")
    VALUES (${`cart_${owner.userId}_${owner.companyId}`.slice(0, 190)}, ${owner.userId}, ${owner.companyId}, ${address?.id ?? null}, now())
    ON CONFLICT ("userId", "companyId") DO NOTHING`;
  return db.cart.findUniqueOrThrow({ where });
}

async function orderableProduct(db: Tx, productId: string) {
  const product = await db.product.findFirst({ where: { id: productId, active: true, category: { active: true } } });
  if (!product) throw new ServiceError("This product isn't available to order.");
  return product;
}

/** Adds to (or with `set`, replaces) the quantity of a product in the cart. */
export async function addToCart(db: Db, owner: CartOwner, productId: string, qty: number, mode: "add" | "set" = "add") {
  const product = await orderableProduct(db, productId);
  const cart = await getOrCreateCart(db, owner);
  const existing = await db.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId } } });
  const next = mode === "add" && existing ? existing.qty + qty : qty;
  const problem = qtyProblem(product, next);
  if (problem) throw new ServiceError(`${product.name}: ${problem}`, "qty");
  await db.cartItem.upsert({
    where: { cartId_productId: { cartId: cart.id, productId } },
    update: { qty: next },
    create: { cartId: cart.id, productId, qty: next },
  });
  return next;
}

export async function addSkuToCart(db: Db, owner: CartOwner, sku: string, qty: number) {
  const product = await db.product.findUnique({ where: { sku: sku.trim().toUpperCase() } });
  if (!product) throw new ServiceError(`No product with SKU ${sku}.`, "sku");
  return addToCart(db, owner, product.id, qty);
}

export async function removeFromCart(db: Db, owner: CartOwner, productId: string) {
  const cart = await getOrCreateCart(db, owner);
  await db.cartItem.deleteMany({ where: { cartId: cart.id, productId } });
}

/** Staff-only manual unit price. Pass null to go back to the calculated price. */
export async function setCartOverride(db: Db, owner: CartOwner, productId: string, price: number | null, reason: string | null) {
  if (!owner.isStaff) throw new ServiceError("Only VITICO staff can set a manual price.");
  if (price !== null && (!reason || reason.trim().length < 3)) throw new ServiceError("Give a reason for the manual price.", "reason");
  const cart = await getOrCreateCart(db, owner);
  const { count } = await db.cartItem.updateMany({
    where: { cartId: cart.id, productId },
    data: { overridePrice: price, overrideReason: price === null ? null : reason },
  });
  if (count === 0) throw new ServiceError("That product isn't in the cart.");
}

export async function updateCartDetails(
  db: Db,
  owner: CartOwner,
  input: { addressId: string | null; pickup: boolean; poNumber: string | null; notes: string | null; requestedDate: Date | null },
) {
  if (!input.pickup) {
    if (!input.addressId) throw new ServiceError("Choose a delivery address or pickup.", "addressId");
    const address = await db.address.findFirst({ where: { id: input.addressId, companyId: owner.companyId } });
    if (!address) throw new ServiceError("Choose one of your delivery addresses.", "addressId");
  }
  if (input.requestedDate && input.requestedDate < new Date(Date.now() - 86_400_000)) {
    throw new ServiceError("The requested date is in the past.", "requestedDate");
  }
  const cart = await getOrCreateCart(db, owner);
  await db.cart.update({
    where: { id: cart.id },
    data: { addressId: input.pickup ? null : input.addressId, pickup: input.pickup, poNumber: input.poNumber, notes: input.notes, requestedDate: input.requestedDate },
  });
}

export async function clearCart(db: Tx, cartId: string) {
  await db.cartItem.deleteMany({ where: { cartId } });
  await db.cart.update({ where: { id: cartId }, data: { poNumber: null, notes: null, requestedDate: null } });
}

// ─── Pricing a cart ──────────────────────────────────────────────────────────

const cartInclude = {
  items: { include: { product: { include: { stock: true, category: true } } }, orderBy: { createdAt: "asc" } },
  address: { include: { region: true } },
} as const satisfies Prisma.CartInclude;

export type PricedLine = {
  itemId: string;
  product: Prisma.ProductGetPayload<{ include: { stock: true; category: true } }>;
  qty: number;
  calculatedCents: number;
  unitCents: number;
  priceSource: string;
  priceLabel: string;
  override: { cents: number; reason: string; belowMargin: boolean } | null;
  nextBreak: { minQty: number; unitCents: number } | null;
  vatPercent: number;
  netCents: number;
  vatCents: number;
  available: number;
  problems: string[];
};

/** The cart with every line priced for its delivery region, totals and any blocking problems. */
export async function priceCart(db: Tx, owner: CartOwner) {
  const cart = await getOrCreateCart(db, owner);
  const full = await db.cart.findUniqueOrThrow({ where: { id: cart.id }, include: cartInclude });
  const company = await db.company.findUniqueOrThrow({ where: { id: owner.companyId } });
  const regionId = !full.pickup && full.address ? full.address.regionId : company.regionId;
  const pricer = await createPricer(db, { companyId: owner.companyId, regionId });
  const prices = await pricer.forProducts(full.items.map((i) => i.product));

  const lines: PricedLine[] = full.items.map((item) => {
    const p = item.product;
    const pricing = prices.get(p.id)!;
    const r = pricing.at(item.qty);
    const overrideCents = item.overridePrice != null ? toCents(item.overridePrice) : null;
    const cost = p.costPrice ? toCents(p.costPrice) : null;
    const unitCents = overrideCents ?? r.unitCents;
    const netCents = unitCents * item.qty;
    const available = availableOf(p.stock);
    const problems: string[] = [];
    if (!p.active || !p.category.active) problems.push("No longer available.");
    const q = qtyProblem(p, item.qty);
    if (q) problems.push(q);
    if (item.qty > available) problems.push(available > 0 ? `Only ${available} available.` : "Out of stock.");
    return {
      itemId: item.id,
      product: p,
      qty: item.qty,
      calculatedCents: r.unitCents,
      unitCents,
      priceSource: overrideCents != null ? "MANUAL" : r.source,
      priceLabel: overrideCents != null ? "Manual price (needs approval)" : r.label,
      override:
        overrideCents != null
          ? {
              cents: overrideCents,
              reason: item.overrideReason ?? "",
              belowMargin: cost != null && overrideCents < cost * (1 + pricer.config.minMarginPercent / 100),
            }
          : null,
      nextBreak: r.nextBreak,
      vatPercent: pricing.vatPercent,
      netCents,
      vatCents: vatCents(netCents, pricing.vatPercent),
      available,
      problems,
    };
  });

  const subtotalCents = lines.reduce((s, l) => s + l.netCents, 0);
  const vatTotalCents = lines.reduce((s, l) => s + l.vatCents, 0);
  return {
    cart: full,
    company,
    regionId,
    region: pricer.region,
    isExport: pricer.isExport,
    currency: pricer.currency,
    lines,
    subtotalCents,
    vatTotalCents,
    totalCents: subtotalCents + vatTotalCents,
    cbm: lines.reduce((s, l) => s + Number(l.product.cartonCbm) * l.qty, 0),
    weightKg: lines.reduce((s, l) => s + Number(l.product.cartonWeightKg) * l.qty, 0),
    hasProblems: lines.some((l) => l.problems.length > 0),
    hasOverrides: lines.some((l) => l.override),
  };
}

export type PricedCart = Awaited<ReturnType<typeof priceCart>>;
