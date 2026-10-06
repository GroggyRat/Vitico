import type { Db, Prisma } from "@vitico/db";

type Tx = Db | Prisma.TransactionClient;

export function audit(
  tx: Tx,
  entry: { actorId: string | null; action: string; entityType: string; entityId: string; data?: Prisma.InputJsonValue },
) {
  return tx.auditLog.create({ data: entry });
}
