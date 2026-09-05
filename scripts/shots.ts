/**
 * Design-review screenshots of the mock app at phone size (and one wide frame).
 * Usage: pnpm dev:mock (in another shell) then `npx tsx scripts/shots.ts <outDir>`.
 */
import { chromium, type Page } from '@playwright/test';

const out = process.argv[2] ?? 'shots';
const base = process.env.BASE_URL ?? 'http://localhost:5173';

async function shot(page: Page, name: string) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('saved', name);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-SG', timezoneId: 'Asia/Singapore' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });

await page.goto(`${base}/mark`);
await page.getByRole('button', { name: /Daniel Tan/ }).waitFor({ timeout: 20_000 });
await shot(page, '01-mark-default');

// Filter to absentees
await page.getByRole('button', { name: /^Absent/ }).click();
await shot(page, '02-mark-absent-filter');
await page.getByRole('button', { name: /^All/ }).click();

// Open the sheet for Daniel Tan (MC)
await page.getByRole('button', { name: /Daniel Tan/ }).click();
await page.locator('dialog[open]').waitFor();
await shot(page, '03-sheet-mc');

// Switch to Others to show sub-types
await page.getByRole('button', { name: /^Others/ }).click();
await shot(page, '04-sheet-others');
await page.getByRole('button', { name: 'Cancel and close' }).click();

// Mark someone RSI and submit
await page.getByRole('button', { name: /Amir Rahman/ }).click();
await page.getByRole('button', { name: /^RSI/ }).click();
await shot(page, '05-sheet-rsi');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(600);
await shot(page, '06-mark-after-change');
await page.getByRole('button', { name: 'Submit to S1' }).click();
await page.locator('dialog[open]').waitFor();
await shot(page, '07-confirm-submit');
await page.getByRole('button', { name: 'Submit', exact: true }).click();
await page.locator('.footer__submitted').waitFor();
await shot(page, '08-mark-submitted');

// Change after submission -> resubmit state
await page.getByRole('button', { name: /Ryan Lim/ }).click();
await page.getByRole('button', { name: /^MA/ }).click();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('button', { name: 'Resubmit to S1' }).waitFor();
await page.getByRole('button', { name: /change.* since submission/ }).click();
await shot(page, '09-mark-resubmit');

// Empty search
await page.getByRole('searchbox').fill('zzzz');
await shot(page, '10-mark-empty-search');
await page.getByRole('button', { name: 'Clear search' }).click();

// Wide viewport
const wide = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await wide.goto(`${base}/mark`);
await wide.getByRole('button', { name: /Daniel Tan/ }).waitFor({ timeout: 20_000 });
await wide.waitForTimeout(300);
await wide.screenshot({ path: `${out}/11-mark-wide.png` });
console.log('saved 11-mark-wide');

await browser.close();
