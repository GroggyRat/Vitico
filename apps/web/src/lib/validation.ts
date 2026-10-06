import * as z from "zod";
import { parseBusinessTime } from "./time";

const trimmed = () => z.string().trim();
const optionalText = () =>
  z
    .string()
    .trim()
    .transform((v) => v || null)
    .nullable()
    .optional();

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

export const passwordSchema = z
  .string()
  .min(10, { error: "Use at least 10 characters." })
  .max(200)
  .regex(/[a-zA-Z]/, { error: "Include at least one letter." })
  .regex(/[0-9]/, { error: "Include at least one number." });

export const moneySchema = z
  .preprocess(
    // Blank inputs mean "not entered", not zero.
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce
      .number({ error: "Enter an amount." })
      .min(0, { error: "Must be 0 or more." })
      .max(99_999_999.99),
  )
  .transform((v) => Math.round(v * 100) / 100);

const optionalMoney = z
  .union([z.literal(""), moneySchema])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }),
});

export const signupSchema = z.object({
  companyName: trimmed().min(2, { error: "Enter your business name." }).max(200),
  tradingName: optionalText(),
  taxNumber: trimmed().min(3, { error: "Enter your TIN or business registration number." }).max(50),
  companyEmail: emailSchema,
  phone: trimmed().min(5, { error: "Enter a phone number." }).max(30),
  regionId: trimmed().min(1, { error: "Choose your delivery region." }),
  addressLine1: trimmed().min(3, { error: "Enter your street address." }).max(200),
  addressLine2: optionalText(),
  city: trimmed().min(2, { error: "Enter your town or city." }).max(100),
  notes: optionalText(),
  name: trimmed().min(2, { error: "Enter your name." }).max(100),
  email: emailSchema,
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const companyRoleSchema = z.enum(["OWNER", "PURCHASING", "ACCOUNTS"]);
export const staffRoleSchema = z.enum(["SUPER_ADMIN", "ADMIN", "PRICING_MANAGER", "SALES_REP", "ACCOUNTS"]);

export const inviteCompanyUserSchema = z.object({
  name: trimmed().min(2, { error: "Enter their name." }).max(100),
  email: emailSchema,
  role: companyRoleSchema,
  orderLimit: optionalMoney,
});
export type InviteCompanyUserInput = z.infer<typeof inviteCompanyUserSchema>;

export const updateCompanyUserSchema = z.object({
  role: companyRoleSchema,
  orderLimit: optionalMoney,
});

export const inviteStaffSchema = z.object({
  name: trimmed().min(2, { error: "Enter their name." }).max(100),
  email: emailSchema,
  staffRole: staffRoleSchema,
});

export const acceptInviteSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    error: "Passwords don't match.",
    path: ["confirmPassword"],
  });

export const approveCompanySchema = z.object({
  tierId: trimmed().min(1, { error: "Choose a tier." }),
  regionId: trimmed().min(1, { error: "Choose a region." }),
  creditLimit: moneySchema,
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  salesRepId: optionalText(),
});
export type ApproveCompanyInput = z.infer<typeof approveCompanySchema>;

export const updateCompanySchema = approveCompanySchema.extend({
  name: trimmed().min(2).max(200),
  tradingName: optionalText(),
  taxNumber: optionalText(),
  email: emailSchema,
  phone: optionalText(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const rejectCompanySchema = z.object({
  reason: trimmed().min(3, { error: "Give a reason (shared with the applicant)." }).max(1000),
});

export const regionUpdateSchema = z.object({
  upliftType: z.enum(["NONE", "PERCENT", "FIXED"]),
  upliftValue: z.coerce.number().min(0).max(1000),
  active: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export const tierUpdateSchema = z.object({
  name: trimmed().min(2).max(50),
  discountPercent: z.coerce.number().min(0).max(100),
});

export const addressSchema = z.object({
  label: trimmed().min(1, { error: "Give the address a name." }).max(100),
  line1: trimmed().min(3, { error: "Enter the street address." }).max(200),
  line2: optionalText(),
  city: trimmed().min(2, { error: "Enter the town or city." }).max(100),
  regionId: trimmed().min(1, { error: "Choose a region." }),
});
export type AddressInput = z.infer<typeof addressSchema>;

// ─── Catalogue ───────────────────────────────────────────────────────────────

const intField = (min: number, label: string) =>
  z.coerce.number({ error: `Enter ${label}.` }).int({ error: `${label} must be a whole number.` }).min(min, { error: `${label} must be at least ${min}.` });

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true || v === "1" || v === "yes", z.boolean());

export const vatCategorySchema = z.enum(["STANDARD", "ZERO_RATED", "EXEMPT"]);

export const productSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(2, { error: "Enter a SKU." })
      .max(40)
      .regex(/^[A-Z0-9._-]+$/, { error: "Use letters, numbers, dots, dashes or underscores." }),
    barcode: optionalText(),
    name: trimmed().min(2, { error: "Enter a product name." }).max(200),
    brand: optionalText(),
    description: optionalText(),
    categoryId: trimmed().min(1, { error: "Choose a category." }),
    sellUnit: trimmed().min(1, { error: "Describe the sell unit, e.g. Carton." }).max(100),
    unitsPerCarton: intField(1, "units per carton"),
    moq: intField(1, "minimum order"),
    orderMultiple: intField(1, "order multiple"),
    cartonCbm: z.coerce.number().min(0).max(100).transform((v) => Math.round(v * 10_000) / 10_000),
    cartonWeightKg: z.coerce.number().min(0).max(100_000).transform((v) => Math.round(v * 1000) / 1000),
    basePrice: moneySchema,
    costPrice: optionalMoney,
    vatCategory: vatCategorySchema,
    imageUrl: z
      .union([z.literal(""), z.url({ protocol: /^https?$/, error: "Enter a full http(s) image URL." })])
      .optional()
      .transform((v) => v || null),
    tags: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      ),
    lowStockThreshold: intField(0, "low-stock threshold"),
    active: checkbox,
  })
  .refine((p) => p.moq % p.orderMultiple === 0, {
    error: "Minimum order must be a multiple of the order multiple.",
    path: ["moq"],
  });
export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: trimmed().min(2, { error: "Enter a name." }).max(100),
  parentId: optionalText(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
  active: checkbox,
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const stockAdjustSchema = z.object({
  type: z.enum(["RECEIPT", "ADJUSTMENT"]),
  qty: z.coerce
    .number({ error: "Enter a quantity." })
    .int({ error: "Use whole sell units." })
    .refine((n) => n !== 0, { error: "Quantity can't be zero." }),
  reason: trimmed().min(3, { error: "Say why (e.g. container MSKU1234 received, stocktake)." }).max(500),
});

// ─── Pricing ─────────────────────────────────────────────────────────────────

/** Optional date/datetime form value, interpreted as Fiji local time. */
const optionalDate = (opts: { endOfDay?: boolean } = {}) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const d = parseBusinessTime(v, opts);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "Enter a valid date." });
        return z.NEVER;
      }
      return d;
    });

const adjustmentKind = z.enum(["PERCENT_OFF", "FIXED_PRICE"]);

const percentMax = { error: "A percentage can't exceed 100.", path: ["value"] };
const percentOk = (a: { kind: string; value: number }) => a.kind !== "PERCENT_OFF" || a.value <= 100;

export const pricingConfigSchema = z
  .object({
    priority1: z.enum(["CONTRACT", "PROMOTION", "TIER", "QTY_BREAK"]),
    priority2: z.enum(["CONTRACT", "PROMOTION", "TIER", "QTY_BREAK"]),
    priority3: z.enum(["CONTRACT", "PROMOTION", "TIER", "QTY_BREAK"]),
    priority4: z.enum(["CONTRACT", "PROMOTION", "TIER", "QTY_BREAK"]),
    stackTierAndQtyBreak: checkbox,
    minMarginPercent: z.coerce.number().min(0).max(100),
  })
  .refine((v) => new Set([v.priority1, v.priority2, v.priority3, v.priority4]).size === 4, {
    error: "Each pricing source must appear exactly once.",
    path: ["priority1"],
  });

export const contractPriceSchema = z
  .object({
    companyId: trimmed().min(1, { error: "Choose a customer." }),
    sku: trimmed().toUpperCase().min(1, { error: "Enter a SKU." }),
    price: moneySchema,
    regionId: optionalText(),
    minQty: z.coerce.number().int().min(1).default(1),
    validFrom: optionalDate(),
    validTo: optionalDate({ endOfDay: true }),
    note: optionalText(),
  })
  .refine((c) => !c.validFrom || !c.validTo || c.validFrom <= c.validTo, { error: "End must be after start.", path: ["validTo"] });
export type ContractPriceInput = z.infer<typeof contractPriceSchema>;

export const quantityBreakSchema = z
  .object({
    kind: adjustmentKind,
    value: moneySchema,
    minQty: z.coerce.number().int().min(2, { error: "Breaks start at 2 units." }),
  })
  .refine(percentOk, percentMax);

export const tierPriceSchema = z.object({ tierId: trimmed().min(1), price: optionalMoney });

export const promotionSchema = z
  .object({
  kind: adjustmentKind,
  value: moneySchema,
  name: trimmed().min(2, { error: "Name the promotion." }).max(100),
  description: optionalText(),
  minQty: z.coerce.number().int().min(1).default(1),
  startsAt: optionalDate(),
  endsAt: optionalDate({ endOfDay: true }),
  active: checkbox,
  skus: z
    .string()
    .optional()
    .transform((v) =>
      [...new Set((v ?? "").split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))],
    )
    .refine((a) => a.length > 0, { error: "Add at least one SKU." }),
  tierIds: z.array(z.string()).default([]),
  regionIds: z.array(z.string()).default([]),
  })
  .refine(percentOk, percentMax)
  .refine((p) => !p.startsAt || !p.endsAt || p.startsAt <= p.endsAt, { error: "End must be after start.", path: ["endsAt"] });
export type PromotionInput = z.infer<typeof promotionSchema>;

export const fcccSchema = z.object({
  price: moneySchema.refine((v) => v > 0, { error: "Enter the controlled price." }),
  basis: z.enum(["PER_ITEM", "PER_SELL_UNIT"]),
  vatInclusive: checkbox,
  regionId: optionalText(),
  effectiveFrom: optionalDate().refine((d) => d !== null, { error: "Enter the effective date." }),
  expiresAt: optionalDate({ endOfDay: true }),
  reference: optionalText(),
});
export type FcccInput = z.infer<typeof fcccSchema>;

export const exchangeRateSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, { error: "Use a 3-letter currency code." }),
  perFjd: z.coerce.number().positive({ error: "Enter a positive rate." }),
});

// ─── Cart & orders ───────────────────────────────────────────────────────────

export const qtySchema = z.coerce.number({ error: "Enter a quantity." }).int({ error: "Use whole units." }).min(0).max(100_000);

export const cartDetailsSchema = z
  .object({
    delivery: z.string().min(1, { error: "Choose delivery or pickup." }),
    poNumber: optionalText(),
    notes: optionalText(),
    requestedDate: optionalDate(),
  })
  .transform((v) => ({
    pickup: v.delivery === "pickup",
    addressId: v.delivery === "pickup" ? null : v.delivery,
    poNumber: v.poNumber ?? null,
    notes: v.notes ?? null,
    requestedDate: v.requestedDate,
  }));

export const paymentMethodSchema = z.enum(["ON_ACCOUNT", "BANK_DEPOSIT", "MPAISA", "MYCASH"], { error: "Choose a payment method." });

export const submitPaymentSchema = z.object({
  method: z.enum(["BANK_DEPOSIT", "MPAISA", "MYCASH"], { error: "Choose how you paid." }),
  amount: moneySchema.refine((v) => v > 0, { error: "Enter the amount paid." }),
  reference: trimmed().min(3, { error: "Enter the transaction / receipt reference." }).max(100),
});

export const reasonSchema = z.object({ reason: trimmed().min(3, { error: "Give a reason." }).max(1000) });

export const overrideSchema = z.object({
  price: optionalMoney,
  reason: optionalText(),
});

export const paymentSettingsSchema = z.object({
  bankName: z.string().trim().max(100).default(""),
  accountName: z.string().trim().max(100).default(""),
  accountNumber: z.string().trim().max(50).default(""),
  branch: z.string().trim().max(100).default(""),
  swift: z.string().trim().max(20).default(""),
  mpaisaNumber: z.string().trim().max(30).default(""),
  mycashNumber: z.string().trim().max(30).default(""),
  note: z.string().trim().max(1000).default(""),
});
