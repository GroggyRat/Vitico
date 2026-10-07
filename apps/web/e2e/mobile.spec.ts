import { type Page, expect, test } from "@playwright/test";
import { login } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function expectNoSideScroll(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
  expect(scroll, `${path} scrolls sideways on a phone`).toBeLessThanOrEqual(width);
}

test("customer pages fit a phone screen", async ({ page }) => {
  await expectNoSideScroll(page, "/login");
  await login(page, "owner@bulamart.test");
  for (const path of ["/portal", "/portal/catalogue", "/portal/catalogue/RIC-JAS-25", "/portal/cart", "/portal/orders", "/portal/deals", "/portal/containers", "/portal/rebates", "/portal/statement", "/portal/account"]) {
    await expectNoSideScroll(page, path);
  }
  // Tables become stacked cards with labels on phones.
  await page.goto("/portal/rebates");
  await expect(page.locator("td[data-label='Status']").first()).toBeVisible();
});

test("admin pages fit a phone screen", async ({ page }) => {
  await login(page, "admin@vitico.test");
  for (const path of ["/admin", "/admin/companies", "/admin/orders", "/admin/catalogue", "/admin/deals", "/admin/reports", "/admin/rebates"]) {
    await expectNoSideScroll(page, path);
  }
});

test("the menu button opens every page on a phone", async ({ page }) => {
  await login(page, "owner@bulamart.test");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Orders" }).click();
  await expect(page).toHaveURL(/\/portal\/orders$/);
  await expect(page.getByRole("navigation", { name: "Menu" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, "admin@vitico.test");
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Deal Drops" }).click();
  await expect(page.getByRole("heading", { name: "Deal Drops" })).toBeVisible();
});
