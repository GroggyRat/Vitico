import { type Prisma, StockMovementType } from "@vitico/db";
import { ServiceError } from "../errors";

type Tx = Prisma.TransactionClient;

export type StockBalances = { onHand: number; reserved: number; allocated: number };

export function availableOf(s: StockBalances | null | undefined): number {
  return s ? s.onHand - s.reserved - s.allocated : 0;
}

/** How each movement type changes the three balances for a positive quantity. */
const effects: Record<StockMovementType, (q: number) => StockBalances> = {
  RECEIPT: (q) => ({ onHand: q, reserved: 0, allocated: 0 }),
  ADJUSTMENT: (q) => ({ onHand: q, reserved: 0, allocated: 0 }), // q may be negative
  RESERVE: (q) => ({ onHand: 0, reserved: q, allocated: 0 }),
  RELEASE: (q) => ({ onHand: 0, reserved: -q, allocated: 0 }),
  DISPATCH: (q) => ({ onHand: -q, reserved: -q, allocated: 0 }),
  ALLOCATE: (q) => ({ onHand: 0, reserved: 0, allocated: q }),
  DEALLOCATE: (q) => ({ onHand: 0, reserved: 0, allocated: -q }),
};

export type StockMove = {
  productId: string;
  type: StockMovementType;
  /** Sell units. Positive, except ADJUSTMENT which may be negative. */
  qty: number;
  reason?: string | null;
  refType?: string;
  refId?: string;
  actorId?: string | null;
};

/**
 * The only way stock changes. Must run inside a transaction: locks the product's
 * stock row so concurrent orders/deals can't oversell, validates the result,
 * and writes an immutable ledger entry.
 */
export async function moveStock(tx: Tx, move: StockMove) {
  const { productId, type, qty } = move;
  if (!Number.isInteger(qty) || qty === 0) throw new ServiceError("Quantity must be a whole number other than zero.");
  if (type !== StockMovementType.ADJUSTMENT && qty < 0) throw new ServiceError("Quantity must be positive.");

  await tx.$executeRaw`INSERT INTO "StockLevel" ("productId", "updatedAt") VALUES (${productId}, now()) ON CONFLICT DO NOTHING`;
  const [current] = await tx.$queryRaw<StockBalances[]>`
    SELECT "onHand", "reserved", "allocated" FROM "StockLevel" WHERE "productId" = ${productId} FOR UPDATE`;

  const d = effects[type](qty);
  const next = {
    onHand: current.onHand + d.onHand,
    reserved: current.reserved + d.reserved,
    allocated: current.allocated + d.allocated,
  };

  if (next.onHand < 0) throw new ServiceError(`Only ${current.onHand} on hand.`);
  if (next.reserved < 0 || next.allocated < 0) throw new ServiceError("Can't release more than is held.");
  if ((d.reserved > 0 || d.allocated > 0) && availableOf(next) < 0) {
    throw new ServiceError(`Only ${availableOf(current)} available.`);
  }
  if (d.onHand < 0 && availableOf(next) < 0 && type === StockMovementType.ADJUSTMENT) {
    throw new ServiceError(
      `Can't reduce below what's already held for orders and deals (${current.reserved + current.allocated}).`,
    );
  }

  await tx.stockLevel.update({ where: { productId }, data: next });
  return tx.stockMovement.create({
    data: {
      productId,
      type,
      onHandDelta: d.onHand,
      reservedDelta: d.reserved,
      allocatedDelta: d.allocated,
      onHandAfter: next.onHand,
      reservedAfter: next.reserved,
      allocatedAfter: next.allocated,
      reason: move.reason ?? null,
      refType: move.refType,
      refId: move.refId,
      actorId: move.actorId ?? null,
    },
  });
}

export type StockStatus = "in_stock" | "low" | "out";

export function stockStatus(available: number, lowThreshold: number): StockStatus {
  if (available <= 0) return "out";
  return available <= lowThreshold ? "low" : "in_stock";
}
