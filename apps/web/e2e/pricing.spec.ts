import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("customers see their own prices, with contract, tier and FCCC savings", async ({ page }) => {
  // Bula Mart: VIP tier (5%), Viti Levu, contract on corned beef.
  await login(page, "owner@bulamart.test");
  await page.goto("/portal/catalogue/CBF-340-24");
  await expect(page.getByText("$104.50").first()).toBeVisible();
  await expect(page.getByText("Your contract price").first()).toBeVisible();
  await expect(page.getByText("excl. 15% VAT")).toBeVisible();
  await expect(page.getByRole("heading", { name: "FCCC price comparison" })).toBeVisible();

  // VIP tier price on rice: 52.50 × 0.95 = 49.88
  await page.goto("/portal/catalogue/RIC-JAS-25");
  await expect(page.getByText("$49.88").first()).toBeVisible();
  await logout(page);

  // Apia Wholesale: Partner tier (8%), Samoa export → 0% VAT and WST shown.
  await login(page, "owner@apiawholesale.test");
  await page.goto("/portal/catalogue/RIC-JAS-25");
  await expect(page.getByText("$48.30").first()).toBeVisible(); // 52.50 × 0.92
  await expect(page.getByText(/VAT 0%.*WST/)).toBeVisible();
});

test("a pricing manager adds a quantity break and checks the result", async ({ page }) => {
  await login(page, "pricing@vitico.test");
  await page.getByRole("link", { name: "Catalogue", exact: true }).click();
  await page.getByLabel("Search").fill("SPG-500-20");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("link", { name: "Spaghetti 20 × 500g" }).click();
  await page.getByLabel("From qty").fill("30");
  await page.getByLabel("Value", { exact: true }).fill("10");
  await page.getByRole("button", { name: "Add break" }).click();
  await expect(page.getByText("30+ units: 10% off ($32.40)")).toBeVisible();

  await page.goto("/admin/pricing/check");
  await page.getByLabel("Customer").selectOption({ label: "Labasa Family Store" });
  await page.getByLabel("SKU").fill("SPG-500-20");
  await page.getByLabel("Quantity").fill("30");
  await page.getByRole("button", { name: "Check price" }).click();
  // Standard tier, Vanua Levu (+5%): 36.00 × 0.9 × 1.05 = 34.02
  await expect(page.getByText("$34.02").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bulk price (30+)" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Vanua Levu +5%" })).toBeVisible();
});
