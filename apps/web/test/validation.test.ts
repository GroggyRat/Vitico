import { describe, expect, it } from "vitest";
import { inviteCompanyUserSchema, passwordSchema, signupSchema } from "@/lib/validation";

describe("passwordSchema", () => {
  it.each(["short1", "onlyletterslong", "1234567890"])("rejects %s", (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
  it("accepts 10+ chars with a letter and number", () => {
    expect(passwordSchema.safeParse("bulavinaka1").success).toBe(true);
  });
});

describe("inviteCompanyUserSchema", () => {
  it("normalises email and treats a blank limit as no limit", () => {
    const r = inviteCompanyUserSchema.parse({ name: "Losana", email: " Losana@Store.TEST ", role: "PURCHASING", orderLimit: "" });
    expect(r.email).toBe("losana@store.test");
    expect(r.orderLimit).toBeNull();
  });
  it("rounds limits to cents", () => {
    const r = inviteCompanyUserSchema.parse({ name: "Losana", email: "l@s.test", role: "PURCHASING", orderLimit: "1500.555" });
    expect(r.orderLimit).toBe(1500.56);
  });
  it("rejects negative limits", () => {
    expect(inviteCompanyUserSchema.safeParse({ name: "L", email: "l@s.test", role: "PURCHASING", orderLimit: "-1" }).success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("turns empty optional fields into null", () => {
    const r = signupSchema.parse({
      companyName: "Bula Mart",
      tradingName: "",
      taxNumber: "50-12345",
      companyEmail: "orders@bula.test",
      phone: "+679 123 4567",
      regionId: "r1",
      addressLine1: "Queens Road",
      addressLine2: "",
      city: "Nadi",
      notes: "",
      name: "Vikash",
      email: "vikash@bula.test",
      password: "bulavinaka1",
    });
    expect(r.tradingName).toBeNull();
    expect(r.addressLine2).toBeNull();
  });
});
