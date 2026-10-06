import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("ordering lights up the bell for the customer and VITICO", async ({ page }) => {
  await login(page, "owner@taveunitraders.test");
  await page.goto("/portal/catalogue/SUG-WHT-10X2");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText(/in cart/)).toBeVisible();
  await page.goto("/portal/cart");
  await page.getByRole("radio", { name: /Bank deposit/ }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/portal\/orders\/.+placed=1/);
  const number = (await page.getByRole("heading", { level: 1 }).textContent())!.replace("Order ", "");

  await page.getByRole("link", { name: /Notifications \(\d+ unread\)/ }).click();
  await page.getByRole("button", { name: new RegExp(`Order ${number} received`) }).click();
  await expect(page).toHaveURL(/\/portal\/orders\//);
  await page.goto("/portal/notifications");
  await expect(page.getByText("You're all caught up.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await login(page, "rep@vitico.test");
  await page.goto("/admin/notifications");
  await expect(page.getByText(`New order ${number} from Taveuni Island Traders`)).toBeVisible();
});

test("profile: change notification settings; forgot password never reveals accounts", async ({ page }) => {
  await login(page, "accounts@bulamart.test");
  await page.goto("/portal/profile");
  await page.getByLabel("Mobile (for SMS)").fill("+679 912 0000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await page.getByLabel("Payments & invoices by sms").check();
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await expect(page.getByText("Notification settings saved.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  for (const email of ["accounts@bulamart.test", "nobody@nowhere.test"]) {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a reset link" }).click();
    await expect(page.getByText(/If that email has an account/)).toBeVisible();
  }
});
