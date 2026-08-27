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
await page.goto('http://localhost:5173/perfil', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const h1 = document.querySelector('h1');
  const header = document.querySelector('header');
  return {
    scrollY: window.scrollY,
    h1Rect: h1 ? h1.getBoundingClientRect().toJSON() : null,
    h1Text: h1?.textContent,
    headerRect: header ? header.getBoundingClientRect().toJSON() : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
