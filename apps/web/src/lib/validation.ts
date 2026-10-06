import * as z from "zod";

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

export const moneySchema = z.coerce
  .number({ error: "Enter an amount." })
  .min(0, { error: "Must be 0 or more." })
  .max(99_999_999.99)
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
