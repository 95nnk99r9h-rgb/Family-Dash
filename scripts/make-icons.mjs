// Rendert public/icons/icon.svg in die PNG-Größen für iOS/Android (benötigt Playwright).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';

const svg = fs.readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = n => new URL(`../public/icons/${n}`, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [['apple-touch-icon.png', 180, 0], ['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 0.1]]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#2a2e7a;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: out(name), omitBackground: false });
  console.log('✓', name);
}
await browser.close();
