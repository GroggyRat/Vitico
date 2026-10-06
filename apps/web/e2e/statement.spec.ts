import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("accounts users see their statement; admins see Odoo status", async ({ page }) => {
  await login(page, "accounts@bulamart.test");
  await page.getByRole("link", { name: "Statement", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Statement" })).toBeVisible();
  await expect(page.getByText("Available credit")).toBeVisible();
  await expect(page.getByText("No invoices yet.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // Purchasing users don't get the statement.
  await login(page, "buyer@bulamart.test");
  await expect(page.getByRole("link", { name: "Statement", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();

  await login(page, "admin@vitico.test");
  await page.getByRole("link", { name: "Odoo", exact: true }).click();
  await expect(page.getByText("Not configured")).toBeVisible();
});
