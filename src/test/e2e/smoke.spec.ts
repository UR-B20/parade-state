import { expect, test } from '@playwright/test';

/**
 * Phone-size smoke test over the demo dataset: commander marks and submits, S1 sees the change.
 * Runs against the mock API (pnpm dev:mock) unless E2E_BASE_URL points at a real deployment
 * with the demo battalion seeded.
 */
test.describe('Parade State', () => {
  test('commander marks, submits and resubmits', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in as Coy 1 commander' }).click();
    await expect(page.getByRole('heading', { name: 'Coy 1' })).toBeVisible();
    await expect(page.locator('.strength__present')).toHaveText('96');
    await expect(page.getByRole('button', { name: /^Absent/ })).toContainText('6');

    // Mark Amir Rahman RSI for today.
    await page.getByRole('button', { name: /Amir Rahman/ }).click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'LCP Amir Rahman' })).toBeVisible();
    await sheet.getByRole('button', { name: /^RSI/ }).click();
    await expect(sheet.getByText(/RSI applies to/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: /Amir Rahman/ })).toContainText('RSI');
    await expect(page.getByRole('button', { name: /^Absent/ })).toContainText('7');
    await expect(page.getByText(/All changes saved/)).toBeVisible();

    // Submit with confirmation.
    await page.getByRole('button', { name: 'Submit to S1' }).click();
    const confirm = page.locator('dialog[open]');
    await expect(confirm.locator('.confirm-figure__n')).toHaveText('95');
    await confirm.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.locator('.footer__submitted')).toContainText('Submitted');

    // Change after submission -> resubmit.
    await page.getByRole('button', { name: /Ryan Lim/ }).click();
    await page.locator('dialog[open]').getByRole('button', { name: /^MA/ }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resubmit to S1' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /1 change since submission/ })).toBeVisible();
  });

  test('S1 dashboard shows the battalion, absentees and notifications', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in as S1 admin' }).click();
    await expect(page.getByRole('heading', { name: 'Battalion' })).toBeVisible();
    await expect(page.locator('.strength__present')).toHaveText('287');
    await expect(page.getByText('6 of 8 units submitted')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Awaiting submission' })).toBeVisible();

    await page.getByRole('button', { name: /^Coy 1/ }).click();
    await expect(page.getByRole('list', { name: 'Counts by status' })).toBeVisible();

    await page.getByRole('tab', { name: /Absentees/ }).click();
    await expect(page.getByText('Daniel Tan')).toBeVisible();
    await expect(page.getByRole('tab', { name: /Absentees/ })).toContainText('25');

    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.locator('dialog[open]').getByText('3 unread')).toBeVisible();
    await page.locator('dialog[open]').getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.locator('dialog[open]').getByText('All read')).toBeVisible();
  });

  test('after the cut-off, unsubmitted units are Late', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in as S1 admin' }).click();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Prototype controls' }).click();
    await page.getByRole('button', { name: /10:05/ }).click();
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByText('Late').first()).toBeVisible();
    await expect(page.getByText('Cut-off 10:00 passed')).toBeVisible();
  });
});
