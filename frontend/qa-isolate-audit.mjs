import { chromium } from 'playwright';
import fs from 'fs';
const tokens = JSON.parse(fs.readFileSync('qa-tokens.json', 'utf-8'));
const auth = tokens['qa-empresa@rematar-demo.com'];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width: 320, height: 700 });
await page.addInitScript(({ auth }) => {
  localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
}, { auth });
await page.goto('http://localhost:5173/remates/a8f04735-2b1b-4b3d-a4ba-fbeabdf87cb6/auditoria', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const result = await page.evaluate(() => {
  const docWidth = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('header *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right <= docWidth + 1 && r.left >= -1) return;
    offenders.push({ tag: el.tagName, cls: (typeof el.className === 'string' ? el.className : '').slice(0,140), left: Math.round(r.left), right: Math.round(r.right), text: el.textContent?.slice(0,40) });
  });
  return { docWidth, scrollWidth: document.documentElement.scrollWidth, offenders };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
