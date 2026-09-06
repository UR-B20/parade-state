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

await page.goto(`${base}/login`);
await page.getByRole('button', { name: 'Sign in as Coy 1 commander' }).waitFor({ timeout: 20_000 });
await shot(page, '00-login');
await page.getByRole('button', { name: 'Sign in as Coy 1 commander' }).click();
await page.getByRole('button', { name: /Daniel Tan/ }).first().waitFor({ timeout: 20_000 });
await shot(page, '01-mark-default');

// Filter to those not yet marked, then absentees
await page.getByRole('button', { name: /^Not yet marked/ }).click();
await shot(page, '02a-mark-unmarked-filter');
await page.getByRole('button', { name: /^Absent/ }).click();
await shot(page, '02-mark-absent-filter');
await page.getByRole('button', { name: /^All/ }).click();

// Open the sheet for Daniel Tan (MC)
await page.getByRole('button', { name: /Daniel Tan/ }).first().click();
await page.locator('dialog[open]').waitFor();
await shot(page, '03-sheet-mc');

// Switch to Others to show sub-types
await page.getByRole('button', { name: /^Others/ }).click();
await shot(page, '04-sheet-others');
await page.getByRole('button', { name: 'Cancel and close' }).click();

// Mark someone RSI via the row's Not present button, then mark the rest Present and submit
await page.getByRole('button', { name: /^Not yet marked/ }).click();
const firstUnmarked = page.locator('.person--unmarked').first();
await firstUnmarked.getByRole('button', { name: 'Not present' }).click();
await page.locator('dialog[open]').waitFor();
await shot(page, '05a-sheet-not-present');
await page.getByRole('button', { name: /^RSI/ }).click();
await shot(page, '05-sheet-rsi');
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^All/ }).click();
await shot(page, '06-mark-after-change');
await page.getByRole('button', { name: /Mark remaining/ }).click();
await page.locator('dialog[open]').waitFor();
await shot(page, '06a-confirm-bulk');
await page.locator('dialog[open]').getByRole('button', { name: /^Mark \d+ Present/ }).click();
await page.getByRole('button', { name: 'Submit to S1' }).waitFor();
await page.waitForTimeout(400);
await shot(page, '06b-mark-all-marked');
await page.getByRole('button', { name: 'Submit to S1' }).click();
await page.locator('dialog[open]').waitFor();
await shot(page, '07-confirm-submit');
await page.getByRole('button', { name: 'Submit', exact: true }).click();
await page.locator('.footer__submitted').waitFor();
await shot(page, '08-mark-submitted');

// Change after submission -> resubmit state
await page.getByRole('button', { name: /Ryan Lim/ }).first().click();
await page.locator('dialog[open]').getByRole('button', { name: 'Not present' }).click();
await page.getByRole('button', { name: /^MA/ }).click();
await page.getByRole('button', { name: 'Save', exact: true }).click();
await page.getByRole('button', { name: 'Resubmit to S1' }).waitFor();
await page.getByRole('button', { name: /change.* since submission/ }).click();
await shot(page, '09-mark-resubmit');

// Empty search
await page.getByRole('searchbox').fill('zzzz');
await shot(page, '10-mark-empty-search');
await page.getByRole('button', { name: 'Clear search' }).click();

// Roll management
await page.getByRole('link', { name: 'Manage roll' }).click();
await page.getByRole('button', { name: /Edit CPL Daniel Tan/ }).waitFor({ timeout: 20_000 });
await shot(page, '12-roll');
await page.getByRole('button', { name: 'Add person' }).first().click();
await page.locator('dialog[open]').waitFor();
await shot(page, '13-roll-add');
await page.getByRole('button', { name: 'Add to roll' }).click();
await shot(page, '14-roll-add-validation');
await page.getByRole('button', { name: 'Close' }).click();

// Wide viewport (same session)
const wide = await ctx.newPage();
await wide.setViewportSize({ width: 1280, height: 900 });
await wide.goto(`${base}/login`);
await wide.getByRole('button', { name: 'Sign in as Coy 1 commander' }).waitFor({ timeout: 20_000 });
await wide.waitForTimeout(300);
await wide.screenshot({ path: `${out}/00b-login-wide.png` });
console.log('saved 00b-login-wide');
await wide.getByRole('button', { name: 'Sign in as Coy 1 commander' }).click();
await wide.getByRole('button', { name: /Daniel Tan/ }).first().waitFor({ timeout: 20_000 });
await wide.waitForTimeout(300);
await wide.screenshot({ path: `${out}/11-mark-wide.png` });
console.log('saved 11-mark-wide');
await wide.close();

// ---- Admin ----
const actx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-SG', timezoneId: 'Asia/Singapore' });
const admin = await actx.newPage();
admin.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
await admin.goto(`${base}/login`);
await admin.getByRole('button', { name: 'Sign in as S1 admin' }).click();
await admin.getByRole('heading', { name: 'Battalion' }).waitFor({ timeout: 20_000 });
await admin.getByText('Coy 1', { exact: true }).waitFor();
await shot(admin, '20-admin-units');
await admin.getByRole('button', { name: /^Coy 1/ }).click();
await shot(admin, '21-admin-unit-expanded');
await admin.getByRole('tab', { name: /Absentees/ }).click();
await admin.getByText('Daniel Tan').waitFor();
await shot(admin, '22-admin-absentees');
await admin.getByRole('button', { name: /Notifications/ }).click();
await admin.locator('dialog[open]').waitFor();
await shot(admin, '23-admin-notifications');
await admin.getByRole('button', { name: 'Close' }).first().click();
await admin.getByRole('tab', { name: /^Units/ }).click();
await admin.getByRole('button', { name: /Export/ }).click();
await shot(admin, '24-admin-export');
await admin.keyboard.press('Escape');
// Prototype controls: after AM cut-off -> Late
await admin.getByRole('button', { name: 'Account menu' }).click();
await admin.getByRole('button', { name: 'Prototype controls' }).click();
await shot(admin, '25-prototype-controls');
await admin.getByRole('button', { name: /10:05/ }).click();
await admin.waitForTimeout(800);
await admin.getByRole('button', { name: 'Close' }).first().click();
await admin.getByText('Late').first().waitFor();
await shot(admin, '26-admin-late');
// Accounts + settings
await admin.getByRole('button', { name: 'Account menu' }).click();
await admin.getByRole('link', { name: 'Manage accounts' }).click();
await admin.getByRole('heading', { name: 'Accounts' }).waitFor();
await admin.getByText('S1 admin', { exact: true }).first().waitFor();
await shot(admin, '28-admin-users');
await admin.getByRole('button', { name: 'Create account' }).click();
await admin.locator('dialog[open]').waitFor();
await shot(admin, '29-admin-user-create');
await admin.getByRole('button', { name: 'Close' }).click();
await admin.getByRole('button', { name: 'Account menu' }).click();
await admin.getByRole('link', { name: 'Cut-offs and date unlocks' }).click();
await admin.getByRole('heading', { name: 'Cut-offs and unlocks' }).waitFor();
await admin.getByText('Submission cut-offs').waitFor();
await shot(admin, '30-admin-settings');
// Wide admin
const awide = await actx.newPage();
await awide.setViewportSize({ width: 1280, height: 900 });
await awide.goto(`${base}/login`);
await awide.getByRole('button', { name: 'Sign in as S1 admin' }).click();
await awide.getByRole('table').waitFor({ timeout: 20_000 });
await awide.waitForTimeout(300);
await awide.screenshot({ path: `${out}/27-admin-wide.png` });
console.log('saved 27-admin-wide');

await browser.close();
