import { expect, test } from '@playwright/test';

test('home page renders the platform name', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: /Acme Platform/i })).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: /ACME Platform/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/A clean operating surface for the starter/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Open workspace/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /View health/i })).toBeVisible();

  await expect(page.getByRole('link', { name: 'API Docs', exact: true })).toBeVisible();
});

test('public API docs render on the same origin', async ({ page }) => {
  await page.goto('/api/v1/docs');

  await expect(page).toHaveTitle(/Acme Platform API/i);
});
