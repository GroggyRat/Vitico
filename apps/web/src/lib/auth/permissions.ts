import type { CompanyRole, StaffRole } from "@vitico/db/browser";

/** What each internal role may do. Add a capability here before using it in a guard. */
export const staffCapabilities = {
  "companies.view": ["SUPER_ADMIN", "ADMIN", "PRICING_MANAGER", "SALES_REP", "ACCOUNTS"],
  "companies.approve": ["SUPER_ADMIN", "ADMIN"],
  "companies.edit": ["SUPER_ADMIN", "ADMIN"],
  "companies.credit": ["SUPER_ADMIN", "ADMIN", "ACCOUNTS"],
  "staff.manage": ["SUPER_ADMIN"],
  "settings.pricing": ["SUPER_ADMIN", "PRICING_MANAGER"],
  "audit.view": ["SUPER_ADMIN", "ADMIN"],
  "catalogue.view": ["SUPER_ADMIN", "ADMIN", "PRICING_MANAGER", "SALES_REP", "ACCOUNTS"],
  "catalogue.manage": ["SUPER_ADMIN", "ADMIN", "PRICING_MANAGER"],
  "stock.adjust": ["SUPER_ADMIN", "ADMIN"],
  "pricing.check": ["SUPER_ADMIN", "ADMIN", "PRICING_MANAGER", "SALES_REP", "ACCOUNTS"],
  "orders.view": ["SUPER_ADMIN", "ADMIN", "PRICING_MANAGER", "SALES_REP", "ACCOUNTS"],
  "orders.manage": ["SUPER_ADMIN", "ADMIN"],
  "orders.place_for_customer": ["SUPER_ADMIN", "ADMIN", "SALES_REP"],
  "prices.approve": ["SUPER_ADMIN", "PRICING_MANAGER"],
  "payments.verify": ["SUPER_ADMIN", "ADMIN", "ACCOUNTS"],
  "settings.payments": ["SUPER_ADMIN", "ACCOUNTS"],
  "settings.messages": ["SUPER_ADMIN", "ADMIN"],
} satisfies Record<string, StaffRole[]>;

export type StaffCapability = keyof typeof staffCapabilities;

export function staffCan(role: StaffRole | null | undefined, capability: StaffCapability): boolean {
  return !!role && (staffCapabilities[capability] as StaffRole[]).includes(role);
}

/** Sales reps only see their assigned customers; other staff see all. */
export function seesOnlyAssignedCompanies(role: StaffRole): boolean {
  return role === "SALES_REP";
}

export const companyCapabilities = {
  "team.manage": ["OWNER"],
  "orders.place": ["OWNER", "PURCHASING"],
  "orders.approve": ["OWNER"],
  "finance.view": ["OWNER", "ACCOUNTS"],
} satisfies Record<string, CompanyRole[]>;

export type CompanyCapability = keyof typeof companyCapabilities;

export function companyCan(role: CompanyRole | null | undefined, capability: CompanyCapability): boolean {
  return !!role && (companyCapabilities[capability] as CompanyRole[]).includes(role);
}

export const staffRoleLabels: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin / Ops",
  PRICING_MANAGER: "Pricing manager",
  SALES_REP: "Sales rep",
  ACCOUNTS: "Accounts",
};

export const companyRoleLabels: Record<CompanyRole, string> = {
  OWNER: "Owner",
  PURCHASING: "Purchasing",
  ACCOUNTS: "Accounts",
};
