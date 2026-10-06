/**
 * Production bootstrap: reference data (regions, tiers, container sizes) and the first
 * super admin. No fake data. Safe to run more than once.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=it@vitico.com.fj BOOTSTRAP_ADMIN_NAME="Jo Bloggs" pnpm --filter @vitico/db bootstrap
 *
 * The admin gets a random password nobody knows; they set their own with "Forgot password"
 * on the sign-in page, which emails them a reset link.
 */
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { StaffRole, UserStatus, createDb } from "../src/index";
import { upsertReferenceData } from "./reference-data";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "VITICO Admin";
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Set BOOTSTRAP_ADMIN_EMAIL to the first admin's email address.");

const db = createDb();
await upsertReferenceData(db);

const existing = await db.user.findUnique({ where: { email } });
if (existing) {
  console.log(`${email} already exists; left unchanged.`);
} else {
  await db.user.create({
    data: { email, name, staffRole: StaffRole.SUPER_ADMIN, status: UserStatus.ACTIVE, passwordHash: await hash(randomBytes(32).toString("base64url")) },
  });
  console.log(`Created super admin ${email}. Use "Forgot password" on the sign-in page to set a password.`);
}
await db.$disconnect();
