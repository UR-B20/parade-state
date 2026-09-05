/** Renders the SVG mark to the PNG icons the manifest needs. Run: npx tsx scripts/icons.ts */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch();
async function render(size: number, padding: number, out: string) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const inner = size - padding * 2;
  await page.setContent(`<body style="margin:0;background:${padding ? '#2856CF' : 'transparent'}"><div style="padding:${padding}px;width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  const buf = await page.screenshot({ omitBackground: padding === 0, type: 'png' });
  writeFileSync(out, buf);
  await page.close();
  console.log('wrote', out);
}
await render(192, 0, 'public/icons/icon-192.png');
await render(512, 0, 'public/icons/icon-512.png');
await render(512, 64, 'public/icons/icon-512-maskable.png');
await render(180, 0, 'public/apple-touch-icon.png');
await browser.close();
