import { test, expect } from '@playwright/test';

test('has hero section', async ({ page }) => {
  await page.goto('http://localhost:5173/'); // Assuming default Vite port
  await expect(page.locator('text=Voice Agents')).toBeVisible();
});
