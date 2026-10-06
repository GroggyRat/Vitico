import { type Page, expect, test } from "@playwright/test";

const SEED_PASSWORD = "Vitico!2026";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

test("a new customer applies, is approved, and onboards a buyer", async ({ page }) => {
  // 1. Apply.
  await page.goto("/signup");
  await page.getByLabel("Registered business name").fill("Savusavu Bay Traders");
  await page.getByLabel("TIN / registration no.").fill("50-99887-0-1");
  await page.getByLabel("Business phone").fill("+679 885 0000");
  await page.getByLabel("Business email (for invoices)").fill("accounts@savusavu.test");
  await page.getByLabel("Region").selectOption({ label: "Fiji — Vanua Levu" });
  await page.getByLabel("Street address").fill("Main Street");
  await page.getByLabel("Town / city").fill("Savusavu");
  await page.getByLabel("Your name").fill("Kalesi Naivalu");
  await page.getByLabel("Your email").fill("kalesi@savusavu.test");
  await page.getByLabel("Password").fill("savusavu-2026");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("heading", { name: /application received/i })).toBeVisible();

  // Can't sign in until approved.
  await login(page, "kalesi@savusavu.test", "savusavu-2026");
  await expect(page.getByText(/still being reviewed/)).toBeVisible();

  // 2. Admin approves with VIP tier and credit.
  await login(page, "admin@vitico.test", SEED_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "Applications", exact: true }).click();
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Savusavu Bay Traders" }) });
  await card.getByLabel("Tier").selectOption({ label: "VIP (5% off)" });
  await card.getByLabel("Sales rep").selectOption({ label: "Ravinesh Kumar" });
  await card.getByLabel("Credit limit (FJD)").fill("15000");
  await card.getByLabel("Payment terms (days)").selectOption("30");
  await card.getByRole("button", { name: "Approve account" }).click();
  await expect(page.getByRole("status")).toContainText("can now sign in");
  await expect(page.getByRole("heading", { name: "Savusavu Bay Traders" })).toBeVisible();
  await logout(page);

  // 3. Owner signs in and invites a buyer with an approval limit.
  await login(page, "kalesi@savusavu.test", "savusavu-2026");
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByText("VIP")).toBeVisible();
  await expect(page.getByText("Ravinesh Kumar")).toBeVisible();
  await page.getByRole("link", { name: "Team", exact: true }).click();
  await page.getByLabel("Name").fill("Tomasi Buyer");
  await page.getByLabel("Email").fill("tomasi@savusavu.test");
  await page.getByLabel("Order approval limit (FJD)").fill("2500");
  await page.getByRole("button", { name: "Send invite" }).click();
  const inviteLink = await page.getByRole("textbox", { name: "Link" }).inputValue();
  expect(inviteLink).toContain("/set-password/");
  await logout(page);

  // 4. Buyer accepts the invite and lands in the portal without team access.
  await page.goto(new URL(inviteLink).pathname);
  await expect(page.getByRole("heading", { name: "Welcome, Tomasi Buyer" })).toBeVisible();
  await page.getByLabel("New password").fill("tomasi-pass-1");
  await page.getByLabel("Confirm password").fill("tomasi-pass-1");
  await page.getByRole("button", { name: "Set password and sign in" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("link", { name: "Team" })).toHaveCount(0);
  await page.goto("/portal/team");
  await expect(page.getByText(/could not be found/i)).toBeVisible();

  // The invite link is single-use.
  await logout(page);
  await page.goto(new URL(inviteLink).pathname);
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
});

test("sales reps only see their assigned customers and can't reach admin settings", async ({ page }) => {
  await login(page, "rep@vitico.test", SEED_PASSWORD);
  await page.getByRole("link", { name: "Customers", exact: true }).click();
  await expect(page.getByRole("link", { name: "Bula Mart Supermarket Ltd" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuku'alofa Trading Ltd" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await page.goto("/admin/staff");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test("customers can't open the admin", async ({ page }) => {
  await login(page, "buyer@bulamart.test", SEED_PASSWORD);
  await expect(page).toHaveURL(/\/portal$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/portal$/);
});
