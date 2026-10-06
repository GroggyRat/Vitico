import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

test("order → pay → verify → fulfil → dispatch", async ({ page }) => {
  // Customer orders 2 bags of rice from the product page, paying by M-PAiSA.
  await login(page, "owner@labasafamily.test");
  await page.goto("/portal/catalogue/RIC-JAS-25");
  await page.getByLabel("Quantity").fill("2");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("2 in cart")).toBeVisible();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page.getByRole("heading", { name: "Cart", exact: true })).toBeVisible();
  // Labasa: Standard tier, Vanua Levu +5% → 52.50 × 1.05 = 55.13; ×2 = 110.26; VAT 16.54
  await expect(page.getByText("$126.80")).toBeVisible();
  await page.getByLabel("PO number").fill("LFS-0042");
  await page.getByRole("button", { name: "Save & update prices" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.getByRole("radio", { name: /M-PAiSA/ }).check();
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page.getByText(/your order has been sent/)).toBeVisible();
  const number = (await page.getByRole("heading", { level: 1 }).textContent())!.replace("Order ", "");
  await expect(page.getByText("M-PAiSA merchant")).toBeVisible();
  await page.getByLabel("Transaction / receipt ref.").fill("MP-778812");
  await page.getByRole("button", { name: "Submit payment details" }).click();
  await expect(page.getByText(/received your payment details/)).toBeVisible();
  await logout(page);

  // Accounts confirms the payment.
  await login(page, "accounts@vitico.test");
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await page.getByRole("link", { name: number }).click();
  await page.getByRole("button", { name: "Confirm received" }).click();
  await expect(page.getByText("verified")).toBeVisible();
  await logout(page);

  // Ops fulfils and dispatches.
  await login(page, "ops@vitico.test");
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByRole("link", { name: number }).click();
  for (const step of ["Mark confirmed", "Mark processing", "Mark ready"]) {
    await page.getByRole("button", { name: step }).click();
    await expect(page.getByRole("button", { name: step })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Dispatch", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark completed" })).toBeVisible();
  await logout(page);

  await login(page, "owner@labasafamily.test");
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(number) }).getByText("Dispatched")).toBeVisible();
});

test("purchasing user over their limit needs the owner's approval", async ({ page }) => {
  await login(page, "buyer@bulamart.test"); // limit $5,000
  await page.goto("/portal/catalogue/MLK-PWD-12");
  await page.getByLabel("Quantity").fill("30"); // VIP tier price $185 → $6,382.50 incl. VAT
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "View cart" }).click();
  await expect(page.getByText(/above your approval limit/)).toBeVisible();
  await page.getByRole("radio", { name: /Bank deposit/ }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/waiting for your account owner's approval/)).toBeVisible();
  await logout(page);

  await login(page, "owner@bulamart.test");
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByRole("link", { name: /VIT-/ }).first().click();
  await expect(page.getByText("This order needs your approval")).toBeVisible();
  await page.getByRole("button", { name: "Approve order" }).click();
  await expect(page.getByText("Submitted").first()).toBeVisible();
});

test("a sales rep orders with a manual price; a pricing manager approves it", async ({ page }) => {
  await login(page, "rep@vitico.test");
  await page.getByRole("link", { name: "Customers", exact: true }).click();
  await page.getByRole("link", { name: "Taveuni Island Traders" }).click();
  await page.getByRole("link", { name: "Place order" }).click();
  await page.getByLabel("SKU").fill("OIL-VEG-4X5");
  await page.getByLabel("Qty").fill("10");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Manual unit price").fill("80");
  await page.getByLabel("Reason for manual price").fill("Matching competitor quote");
  await page.getByRole("button", { name: "Set price" }).click();
  await expect(page.getByText("Manual price (needs approval)")).toBeVisible();
  await page.getByRole("radio", { name: /Credit account/ }).check();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/waiting for a pricing manager/)).toBeVisible();
  const number = (await page.getByRole("heading", { level: 1 }).textContent())!.replace("Order ", "");
  await logout(page);

  await login(page, "pricing@vitico.test");
  await page.getByRole("link", { name: "Price approvals", exact: true }).click();
  await expect(page.getByText("Matching competitor quote")).toBeVisible();
  await page.getByRole("link", { name: number }).click();
  await page.getByRole("button", { name: "Approve prices" }).click();
  await expect(page.getByText("Submitted").first()).toBeVisible();
});
