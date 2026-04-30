import { expect, test } from "@playwright/test";

test("home page renders the platform name", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: /No Reboot HQ/i })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /No Reboot HQ/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/zero-restart service reloads/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open configs/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /View health/i })).toBeVisible();

  await expect(
    page.getByRole("link", { name: "API Docs", exact: true }),
  ).toBeVisible();
});

test("public API docs render on the same origin", async ({ page }) => {
  await page.goto("/api/v1/docs");

  await expect(page).toHaveTitle(/No Reboot HQ API/i);
});
