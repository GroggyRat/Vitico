import type { Db, Prisma } from "@vitico/db";
import { staffCan } from "@/lib/auth/permissions";
import type { StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";

/** Where customers send money for non-account orders. Shown at checkout and on orders. */
export type PaymentSettings = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  swift: string;
  mpaisaNumber: string;
  mycashNumber: string;
  note: string;
};

const EMPTY: PaymentSettings = { bankName: "", accountName: "", accountNumber: "", branch: "", swift: "", mpaisaNumber: "", mycashNumber: "", note: "" };

export async function getPaymentSettings(db: Db | Prisma.TransactionClient): Promise<PaymentSettings> {
  const row = await db.appSetting.findUnique({ where: { key: "payments" } });
  return { ...EMPTY, ...((row?.value ?? {}) as Partial<PaymentSettings>) };
}

export async function savePaymentSettings(db: Db, actor: StaffActor, input: PaymentSettings) {
  if (!staffCan(actor.staffRole, "settings.payments")) throw new ServiceError("You can't change payment settings.");
  const value = input as unknown as Prisma.InputJsonValue;
  await db.appSetting.upsert({ where: { key: "payments" }, update: { value }, create: { key: "payments", value } });
  await audit(db, { actorId: actor.id, action: "settings.payments_updated", entityType: "AppSetting", entityId: "payments" });
}
