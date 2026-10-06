import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("customer fills a 20 ft container with live volume/weight and orders it", async ({ page }) => {
  await login(page, "owner@apiawholesale.test");
  await page.getByRole("link", { name: "Containers", exact: true }).click();
  await page.getByLabel("Name").fill("November rice & oil");
  await page.getByLabel("Container").selectOption({ label: "20 ft, 28 m³ / 21,700 kg" });
  await page.getByRole("button", { name: "Start building" }).click();
  await expect(page.getByRole("heading", { name: "November rice & oil" })).toBeVisible();

  // Add 400 bags of jasmine rice (0.035 m³, 25.2 kg each).
  await page.getByLabel("Search products").fill("jasmine");
  await page.getByLabel("Product", { exact: true }).selectOption({ label: "Jasmine Rice 25kg (RIC-JAS-25)" });
  await page.getByLabel("Cartons", { exact: true }).fill("400");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("meter", { name: "Weight" })).toHaveAttribute("aria-valuenow", "46");

  // Live preview before saving: 800 bags → 93% of payload.
  await page.getByLabel("Cartons of Jasmine Rice 25kg").fill("800");
  await expect(page.getByRole("meter", { name: "Weight" })).toHaveAttribute("aria-valuenow", "93");
  await expect(page.getByText(/Unsaved changes/)).toBeVisible();
  await page.getByRole("button", { name: "Save quantities & update prices" }).click();
  await expect(page.getByText(/Nearly full/)).toBeVisible();

  // Too heavy: blocked.
  await page.getByLabel("Cartons of Jasmine Rice 25kg").fill("900");
  await page.getByRole("button", { name: "Save quantities & update prices" }).click();
  await expect(page.getByText(/Over the container's limit/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Place order" })).toBeDisabled();

  await page.getByLabel("Cartons of Jasmine Rice 25kg").fill("800");
  await page.getByRole("button", { name: "Save quantities & update prices" }).click();
  await expect(page.getByText(/Nearly full/)).toBeVisible();
  await page.getByRole("radio", { name: /Bank deposit/ }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/portal\/orders\/.+placed=1/);
  await expect(page.getByText(/20 ft · 28.00 m³ \(100%\)/)).toBeVisible();
});
