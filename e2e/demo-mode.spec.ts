import { test, expect } from "@playwright/test";

test("has title and main branding", async ({ page }) => {
  await page.goto("/");

  // Expect title to contain SHROUD
  await expect(page).toHaveTitle(/shroud/i);

  // Expect header logo to be visible
  const headerText = page.locator("header");
  await expect(headerText).toContainText("SHROUD");

  // Verify TESTNET ACTIVE badge (branding). The status pill is intentionally
  // hidden below the `md` breakpoint, so assert it's present in the DOM on all
  // viewports and fully visible on non-mobile ones.
  const testnetBadge = page.locator("text=STELLAR TESTNET");
  await expect(testnetBadge).toBeAttached();
  if (test.info().project.name !== "mobile-chrome") {
    await expect(testnetBadge).toBeVisible();
  }
});
