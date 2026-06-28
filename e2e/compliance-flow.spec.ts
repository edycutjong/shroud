import { test, expect } from "@playwright/test";

test("approved compliance address checks successfully", async ({ page }) => {
  await page.goto("/");

  const addressInput = page.locator(
    'input[placeholder="Enter Stellar address (G...)"]',
  );
  await addressInput.fill(
    "GD111111111111111111111111111111111111111111111111111111",
  );

  const queryButton = page.locator('button:has-text("Query ASP")');
  await queryButton.click();

  // Expect approved status
  await expect(page.locator("text=KYC Approved")).toBeVisible();
});

test("revoked address blocks user from deposits", async ({ page }) => {
  await page.goto("/");

  const addressInput = page.locator(
    'input[placeholder="Enter Stellar address (G...)"]',
  );
  await addressInput.fill(
    "GD555555555555555555555555555555555555555555555555555555",
  );

  const queryButton = page.locator('button:has-text("Query ASP")');
  await queryButton.click();

  // Expect blocked alert
  await expect(page.locator("text=ACCESS BLOCKED")).toBeVisible();
});
