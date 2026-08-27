import { chromium } from 'playwright';
import fs from 'fs';
const tokens = JSON.parse(fs.readFileSync('qa-tokens.json', 'utf-8'));
const auth = tokens['qa-empresa@rematar-demo.com'];
const browser = await chromium.launch();
const context = await browser.newContext();
for (const url of ['http://localhost:5173/perfil', 'http://localhost:5173/historial', 'http://localhost:5173/']) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
  }, { auth });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const scrollY = await page.evaluate(() => window.scrollY);
  console.log(url, 'scrollY=', scrollY);
  await page.close();
}
await browser.close();
