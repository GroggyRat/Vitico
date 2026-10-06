import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("customer uses rebate wallet at checkout; admin sees programmes", async ({ page }) => {
  // Bula Mart starts with a $250 welcome credit.
  await login(page, "owner@bulamart.test");
  await expect(page.getByText("Rebate wallet")).toBeVisible();
  await page.getByRole("link", { name: "Rebates", exact: true }).click();
  await expect(page.getByText("$250.00").first()).toBeVisible();
  await expect(page.getByText("Quarterly volume rebate").first()).toBeVisible();

  await page.goto("/portal/catalogue/TEA-BAG-12");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/in cart/)).toBeVisible();
  await page.goto("/portal/cart");
  await page.getByLabel("Use rebate balance (FJD)").fill("20");
  await page.getByRole("radio", { name: /Bank deposit/ }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/placed=1/);
  await expect(page.getByText("Paid with rebates")).toBeVisible();
  await expect(page.getByText("Amount due")).toBeVisible();

  await page.getByRole("link", { name: "Rebates", exact: true }).click();
  await expect(page.getByText("$230.00").first()).toBeVisible();
  await logout(page);

  await login(page, "pricing@vitico.test");
  await page.getByRole("link", { name: "Rebates", exact: true }).click();
  await expect(page.getByRole("link", { name: "Staples cashback" })).toBeVisible();
  await page.getByRole("link", { name: "New programme" }).click();
  await page.getByLabel("Programme name (customers see this)").fill("Oil cashback");
  await page.getByLabel("Type").selectOption("CASHBACK");
  await page.getByLabel("Rebate %").fill("2");
  await page.getByLabel("…or specific SKUs").fill("OIL-VEG-4X5");
  await page.getByRole("button", { name: "Create programme" }).click();
  await expect(page.getByText("Programme saved.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Oil cashback" })).toBeVisible();
});
