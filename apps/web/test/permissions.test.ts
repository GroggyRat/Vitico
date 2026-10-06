import { describe, expect, it } from "vitest";
import { companyCan, seesOnlyAssignedCompanies, staffCan } from "@/lib/auth/permissions";

describe("staff capabilities", () => {
  it("only super admins manage staff", () => {
    expect(staffCan("SUPER_ADMIN", "staff.manage")).toBe(true);
    for (const role of ["ADMIN", "PRICING_MANAGER", "SALES_REP", "ACCOUNTS"] as const) {
      expect(staffCan(role, "staff.manage")).toBe(false);
    }
  });

  it("accounts can change credit but not approve applications", () => {
    expect(staffCan("ACCOUNTS", "companies.credit")).toBe(true);
    expect(staffCan("ACCOUNTS", "companies.approve")).toBe(false);
  });

  it("sales reps can view but not edit, and only their assigned customers", () => {
    expect(staffCan("SALES_REP", "companies.view")).toBe(true);
    expect(staffCan("SALES_REP", "companies.edit")).toBe(false);
    expect(seesOnlyAssignedCompanies("SALES_REP")).toBe(true);
    expect(seesOnlyAssignedCompanies("ADMIN")).toBe(false);
  });

  it("denies everything without a role", () => {
    expect(staffCan(null, "companies.view")).toBe(false);
  });
});

describe("company capabilities", () => {
  it("only owners manage the team and approve orders", () => {
    expect(companyCan("OWNER", "team.manage")).toBe(true);
    expect(companyCan("PURCHASING", "team.manage")).toBe(false);
    expect(companyCan("PURCHASING", "orders.approve")).toBe(false);
  });

  it("accounts users see finance but cannot order", () => {
    expect(companyCan("ACCOUNTS", "finance.view")).toBe(true);
    expect(companyCan("ACCOUNTS", "orders.place")).toBe(false);
    expect(companyCan("PURCHASING", "finance.view")).toBe(false);
  });
});
