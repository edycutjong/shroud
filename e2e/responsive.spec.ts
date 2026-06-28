import { test, expect } from "@playwright/test";

test("renders correctly on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  // Verify console is visible
  await expect(page.locator("#console")).toBeVisible();
});

test("renders correctly on mobile responsive", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");

  // Verify console is visible on mobile
  await expect(page.locator("#console")).toBeVisible();
});
