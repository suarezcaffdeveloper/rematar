import { chromium } from 'playwright';
import fs from 'fs';
const tokens = JSON.parse(fs.readFileSync('qa-tokens.json', 'utf-8'));
const auth = tokens['qa-empresa@rematar-demo.com'];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width: 320, height: 900 });
await page.addInitScript(({ auth }) => {
  localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
}, { auth });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
console.log('URL:', page.url());
await page.screenshot({ path: 'D:/proyectos/RematAR/scratchpad/dashboard_320_after.png', fullPage: true });
const { docWidth, scrollWidth } = await page.evaluate(() => ({ docWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
console.log('docWidth', docWidth, 'scrollWidth', scrollWidth);
await browser.close();
