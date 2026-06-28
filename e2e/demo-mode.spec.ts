import { test, expect } from "@playwright/test";

test("has title and main branding", async ({ page }) => {
  await page.goto("/");

  // Expect title to contain SHROUD
  await expect(page).toHaveTitle(/shroud/i);

  // Expect header logo to be visible
  const headerText = page.locator("header");
  await expect(headerText).toContainText("SHROUD");

  // Verify TESTNET ACTIVE badge
  await expect(page.locator("text=STELLAR TESTNET")).toBeVisible();
});
