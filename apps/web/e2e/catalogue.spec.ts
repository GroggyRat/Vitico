import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("admin adds a product and receives stock; customers can find it", async ({ page }) => {
  await login(page, "ops@vitico.test");
  await page.getByRole("link", { name: "Catalogue", exact: true }).click();
  await page.getByRole("link", { name: "New product" }).click();

  await page.getByLabel("SKU").fill("kav-pwd-12");
  await page.getByLabel("Product name").fill("Kava Powder 12 × 500g");
  await page.getByLabel("Brand").fill("Yaqona Gold");
  await page.getByLabel("Category").selectOption({ label: "Beverages" });
  await page.getByLabel("Sell unit", { exact: true }).fill("Carton 12 × 500g");
  await page.getByLabel("Items per sell unit").fill("12");
  await page.getByLabel("CBM per unit").fill("0.02");
  await page.getByLabel("Weight per unit (kg)").fill("6.5");
  await page.getByLabel("Base price (FJD, excl. VAT)").fill("420");
  await page.getByRole("button", { name: "Create product" }).click();

  await expect(page.getByRole("heading", { name: "Kava Powder 12 × 500g" })).toBeVisible();
  await expect(page.getByText("KAV-PWD-12 · Carton 12 × 500g")).toBeVisible();
  await expect(page.getByText("Out of stock")).toBeVisible();

  await page.getByLabel("Units", { exact: true }).fill("40");
  await page.getByLabel("Reason", { exact: true }).fill("Container MSKU7781234");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Stock updated.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Container MSKU7781234" })).toBeVisible();
  await expect(page.getByText("In stock", { exact: true })).toBeVisible();
  await logout(page);

  await login(page, "owner@bulamart.test");
  await page.getByRole("link", { name: "Products" }).click();
  await page.getByLabel("Search products").fill("kava");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /Kava Powder/ }).click();
  await expect(page.getByRole("heading", { name: "Kava Powder 12 × 500g" })).toBeVisible();
  await expect(page.getByText("In stock")).toBeVisible();
});

test("hidden products and seeded categories behave for customers", async ({ page }) => {
  await login(page, "buyer@bulamart.test");
  await page.goto("/portal/catalogue?category=canned-foods");
  // Parent category includes products from its subcategories.
  await expect(page.getByRole("link", { name: /Tuna Chunks in Oil/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Corned Beef 24/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Jasmine Rice/ })).toHaveCount(0);
  await page.goto("/portal/catalogue/DOES-NOT-EXIST");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});
