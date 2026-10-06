import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("admin views sales and downloads a CSV", async ({ page }) => {
  await login(page, "admin@vitico.test");
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await page.getByLabel("Group by").selectOption("customer");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/group=customer/);
  await expect(page.getByRole("columnheader", { name: "Customer" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^vitico-sales-by-customer-.+\.csv$/);

  await page.getByRole("link", { name: "Stock", exact: true }).click();
  await expect(page.getByText("Stock on hand at cost:")).toBeVisible();
});

test("the app can be installed: manifest, icons and offline page", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ short_name: "VITICO", display: "standalone", start_url: "/portal" });
  expect((await request.get("/icons/icon-512.png")).ok()).toBe(true);
  expect(await (await request.get("/offline.html")).text()).toContain("You're offline");
  expect((await request.get("/healthz")).ok()).toBe(true);
});
