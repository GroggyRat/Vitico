import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("customer secures a Deal Drop with a bank bond, accounts verify, customer completes", async ({ page }) => {
  await login(page, "owner@labasafamily.test");
  await expect(page.getByText("Deal Drops on now")).toBeVisible();
  await page.getByRole("link", { name: "Deals", exact: true }).click();
  await page.getByRole("link", { name: "Pantry Starter Pack" }).click();
  await expect(page.getByText(/units left/).first()).toBeVisible();

  await page.getByLabel(/Deal units/).fill("2");
  await page.getByLabel("Pay the bond by").selectOption("BANK_DEPOSIT");
  await page.getByLabel("Payment reference").fill("TT-555");
  await page.getByRole("button", { name: "Secure units" }).click();
  await expect(page.getByText(/units are held while we check the bond/)).toBeVisible();
  await expect(page.getByText("Bond being checked")).toBeVisible();
  await logout(page);

  await login(page, "accounts@vitico.test");
  await page.goto("/admin/deals/bonds");
  await expect(page.getByText("TT-555")).toBeVisible();
  await page.getByRole("button", { name: /Verify bond from Labasa/ }).click();
  await expect(page.getByText("Nothing to verify.")).toBeVisible();
  await logout(page);

  await login(page, "owner@labasafamily.test");
  await page.goto("/portal/deals");
  await page.getByRole("link", { name: "Pantry Starter Pack" }).click();
  await expect(page.getByText("Secured", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: /Bank deposit/ }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/placed=1/);
  await expect(page.getByText("Deal bond paid")).toBeVisible();
  await expect(page.getByText("Amount due")).toBeVisible();
});

test("a pricing manager drafts and publishes a Deal Drop", async ({ page }) => {
  await login(page, "pricing@vitico.test");
  await page.getByRole("link", { name: "Deal Drops", exact: true }).click();
  await page.getByRole("link", { name: "New deal" }).click();
  await page.getByLabel("Deal name").fill("Oil week");
  await page.getByLabel("Products in one deal unit").fill("OIL-VEG-4X5, 2");
  await page.getByLabel("Deal price per unit (FJD excl. VAT)").fill("150");
  await page.getByLabel("Units on offer").fill("10");
  await page.getByLabel("Most units per customer").fill("2");
  await page.getByLabel("Starts (Fiji time)").fill("2026-01-01T08:00");
  await page.getByLabel("Ends (Fiji time)").fill("2036-01-01T08:00");
  await page.getByRole("checkbox", { name: "Apia Wholesale" }).check();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: "Oil week" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: "Reservations" })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
});
