/// <reference lib="dom" />
/**
 * M3 exit check on a phone-sized browser against the demo backend:
 * the Coy 1 commander loses signal, marks and submits anyway, gets signal back,
 * and the submission is recorded with a version number.
 */
import { expect, test, type Page } from '@playwright/test';

const SHOT_DIR = process.env.E2E_SHOT_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
};

test.describe('commander flow', () => {
  test.beforeEach(async ({ page }) => {
    // Fresh demo database and no remembered sign-in.
    await page.goto('/sign-in');
    await page.evaluate(async () => {
      localStorage.clear();
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map((d) => new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(d.name!);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      })));
    });
    await page.reload();
  });

  test('marks and submits offline, syncs on reconnect', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Parade State' })).toBeVisible({ timeout: 60_000 });
    await shot(page, '01-sign-in');
    await page.getByTestId('demo-account-cdr.coy1@parade-state.demo').click();

    // The roll for today's AM parade, as in the brief.
    await expect(page).toHaveURL(/\/units\/COY1\/events\/2026-09-06-AM$/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Coy 1' })).toBeVisible();
    await expect(page.getByTestId('count-present')).toHaveText('96');
    await expect(page.getByTestId('count-absent')).toHaveText('6');
    await expect(page.getByText('Not submitted')).toBeVisible();
    await shot(page, '02-roll');

    // Signal drops.
    await page.getByTestId('demo-offline').click();
    await expect(page.getByTestId('demo-offline')).toHaveText(/Offline/);

    // Mark Amir Rahman MC for today and tomorrow.
    await page.getByRole('button', { name: /LCP Amir Rahman/ }).click();
    await expect(page.getByRole('dialog', { name: 'LCP Amir Rahman' })).toBeVisible();
    await page.getByRole('button', { name: 'MC', exact: true }).click();
    await page.getByLabel('Remark').fill('Fever, Bedok Polyclinic');
    await shot(page, '03-mark-sheet');
    await page.getByTestId('mark-save').click();

    await expect(page.getByTestId('count-absent')).toHaveText('7');
    await expect(page.getByTestId('count-present')).toHaveText('95');
    await expect(page.getByText('1 change waiting for connection')).toBeVisible();
    const amirRow = page.locator('.list-row', { hasText: 'Amir Rahman' });
    await expect(amirRow).toContainText('MC');
    await expect(amirRow).toContainText('Fever, Bedok Polyclinic');

    // Submit while still offline.
    await page.getByTestId('review-button').click();
    await expect(page.getByRole('heading', { name: 'Review and submit' })).toBeVisible();
    await expect(page.getByText('What S1 will receive')).toBeVisible();
    await shot(page, '04-review');
    await page.getByTestId('submit-button').click();
    await expect(page).toHaveURL(/\/units\/COY1\/events\/2026-09-06-AM$/);
    await expect(page.getByText('2 changes waiting for connection')).toBeVisible();
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();

    // Signal returns: the queue drains in order and the server's answer replaces the local guess.
    await page.getByTestId('demo-offline').click();
    await expect(page.getByText(/waiting for connection/)).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(page.getByText('S1 has this version')).toBeVisible();
    await shot(page, '05-submitted');

    await page.getByRole('link', { name: 'Submission history' }).click();
    await expect(page.getByTestId('history-list')).toContainText('Version 1');
    await expect(page.getByTestId('history-list')).toContainText('95/102 present');
    await expect(page.getByTestId('history-list')).toContainText('Coy 1 commander');
    await shot(page, '06-history');

    // Everything survives a reload: sign-in, the mark and the submission.
    await page.goto('/units/COY1/events/2026-09-06-AM');
    await expect(page.getByTestId('count-absent')).toHaveText('7', { timeout: 30_000 });
    await expect(page.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(page.locator('.list-row', { hasText: 'Amir Rahman' })).toContainText('MC');
  });

  test('a change after submission shows in the review diff and resubmits as v2', async ({ page }) => {
    await page.getByTestId('demo-account-cdr.ssp@parade-state.demo').click();
    await expect(page).toHaveURL(/\/units\/SSP\/events\/2026-09-06-AM$/, { timeout: 30_000 });
    await expect(page.getByText(/Resubmitted \(v2\)/)).toBeVisible();

    // Bring the RSI person back to Present.
    const rsiBand = page.getByRole('region', { name: 'RSI' });
    const name = (await rsiBand.locator('.list-row__title span:nth-child(2)').first().textContent())!.trim();
    await rsiBand.getByRole('button', { name: new RegExp(name) }).click();
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await page.getByRole('button', { name: 'Back to Present' }).click();
    await expect(page.getByText('Changes since')).toBeVisible();
    await expect(page.getByTestId('review-button')).toContainText('1');

    await page.getByTestId('review-button').click();
    await expect(page.getByRole('heading', { name: 'Changes since v2' })).toBeVisible();
    await expect(page.locator('.diff-row')).toHaveCount(1);
    await expect(page.locator('.diff-row')).toContainText(name);
    await expect(page.locator('.diff-row')).toContainText('RSI');
    await page.getByTestId('submit-button').click();
    await expect(page).toHaveURL(/\/units\/SSP\/events\/2026-09-06-AM$/);
    await expect(page.getByText(/Resubmitted \(v3\)/)).toBeVisible({ timeout: 15_000 });
  });

  test('a commander cannot open another unit', async ({ page }) => {
    await page.getByTestId('demo-account-cdr.coy1@parade-state.demo').click();
    await expect(page).toHaveURL(/\/units\/COY1\//, { timeout: 30_000 });
    await page.goto('/units/COY2/events/2026-09-06-AM');
    await expect(page.getByText('Could not load the roll')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('You do not have access to this unit')).toBeVisible();
  });
});
