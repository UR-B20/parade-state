import { expect, test } from '@playwright/test';

/**
 * Phone-size smoke test over the demo dataset: commander marks and submits, S1 sees the change.
 * Runs against the mock API (pnpm dev:mock) unless E2E_BASE_URL points at a real deployment
 * with the demo battalion seeded.
 */
test.describe('SoldierTrack', () => {
  test('commander marks, submits and resubmits', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in as Coy 1 commander' }).click();
    await expect(page.getByRole('heading', { name: 'Coy 1' })).toBeVisible();
    await expect(page.locator('.strength__present')).toHaveText('86');
    await expect(page.getByRole('button', { name: /^Not yet marked/ })).toContainText('10');
    await expect(page.getByRole('button', { name: /^Absent/ })).toContainText('6');
    await expect(page.getByRole('button', { name: 'Submit to S1' })).toBeDisabled();

    // Mark Amir Rahman RSI for today via the sheet.
    await page.getByRole('button', { name: /Amir Rahman/ }).first().click();
    const sheet = page.locator('dialog[open]');
    await expect(sheet.getByRole('heading', { name: 'LCP Amir Rahman' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Not present' }).click();
    await sheet.getByRole('button', { name: /^RSI/ }).click();
    await expect(sheet.getByText(/RSI applies to/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Absent/ })).toContainText('7');
    await expect(page.getByText(/Mark everyone before submitting · 10 left/)).toBeVisible();

    // One tap Present on the first unmarked row, then mark the rest Present in bulk.
    await page.getByRole('button', { name: /^Not yet marked/ }).click();
    await page.locator('.person--unmarked').first().getByRole('button', { name: 'Present', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Not yet marked/ })).toContainText('9');
    await page.getByRole('button', { name: /Mark remaining 9 Present/ }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Mark 9 Present' }).click();
    await expect(page.getByText(/All changes saved/)).toBeVisible();
    await expect(page.locator('.strength__present')).toHaveText('95');

    // Submit with confirmation.
    await page.getByRole('button', { name: 'Submit to S1' }).click();
    const confirm = page.locator('dialog[open]');
    await expect(confirm.locator('.confirm-figure__n')).toHaveText('95');
    await confirm.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.locator('.footer__submitted')).toContainText('Submitted');

    // Change after submission -> resubmit.
    await page.getByRole('button', { name: /^All/ }).click();
    await page.getByRole('button', { name: /Ryan Lim/ }).first().click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Not present' }).click();
    await page.locator('dialog[open]').getByRole('button', { name: /^MA/ }).click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resubmit to S1' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /1 change since submission/ })).toBeVisible();
  });

  test('S1 dashboard shows the battalion, absentees and notifications', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in as S1 Branch admin' }).click();
    await expect(page.getByRole('heading', { name: '15C4I Battalion' })).toBeVisible();
    // Overview: executive summary, KPI tiles and charts on the 14-day history.
    await expect(page.getByText(/^7 of 9 Branches\/Coy have submitted: 269 of 318 marked present, 24 still to mark/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Key figures' })).toContainText('91%');
    await expect(page.getByRole('list', { name: 'Insights' })).toContainText('Coy 2 (3 late, 0 missed)');
    await expect(page.getByRole('img', { name: /Strength composition/ })).toBeVisible();
    await page.getByRole('region', { name: 'Reporting discipline' }).getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('table', { name: 'Reporting discipline' })).toContainText('Coy 2');

    await page.getByRole('tab', { name: /^Branches\/Coy/ }).click();
    await expect(page.locator('.strength__present')).toHaveText('269');
    await expect(page.getByText('7 of 9 submitted')).toBeVisible();
    await expect(page.getByText(/24 not yet marked/)).toBeVisible();
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
    await page.getByRole('button', { name: 'Sign in as S1 Branch admin' }).click();
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Prototype controls' }).click();
    await page.getByRole('button', { name: /10:05/ }).click();
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByText(/Past the cut-off with 2 Branches\/Coy still out/)).toBeVisible();
    await page.getByRole('tab', { name: /^Branches\/Coy/ }).click();
    await expect(page.getByText('Late').first()).toBeVisible();
    await expect(page.getByText('Cut-off 10:00 passed')).toBeVisible();
  });

  test('a half-day LL applies to one parade only and the Roll Call needs no set-up', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in as Coy 1 commander' }).click();
    await expect(page.getByRole('heading', { name: 'Coy 1' })).toBeVisible();
    await page.getByRole('button', { name: /Ryan Lim/ }).first().click();
    const sheet = page.locator('dialog[open]');
    await sheet.getByRole('button', { name: 'Not present' }).click();
    await sheet.getByRole('button', { name: /^LL/ }).click();
    await sheet.getByRole('button', { name: /^PM/ }).click();
    await expect(sheet.getByText(/LL for the PM half of/)).toBeVisible();
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    // The AM parade keeps his Present mark; the PM parade and the Roll Call show the half-day leave.
    await expect(page.getByRole('button', { name: /Ryan Lim, Present/ })).toBeVisible();
    await page.getByRole('button', { name: 'PM parade' }).click();
    await expect(page.getByRole('button', { name: /Ryan Lim, LL \(PM\) · Half day, 1200–1800/ })).toBeVisible();
    await page.getByRole('button', { name: 'Roll call' }).click();
    await expect(page.getByRole('button', { name: /Ryan Lim, LL \(PM\)/ })).toBeVisible();
    await expect(page.getByText(/^Cut-off/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Mark remaining \d+ Present/ })).toBeVisible();
  });
});
