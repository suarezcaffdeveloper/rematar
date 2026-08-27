import { chromium } from 'playwright';
import fs from 'fs';
const tokens = JSON.parse(fs.readFileSync('qa-tokens.json', 'utf-8'));
const auth = tokens['qa-empresa@rematar-demo.com'];

const browser = await chromium.launch();
const context = await browser.newContext();
for (const width of [320, 360, 375, 428, 768]) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
  }, { auth });
  await page.goto('http://localhost:5173/perfil', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if (width === 320) await page.screenshot({ path: 'D:/proyectos/RematAR/scratchpad/perfil_320_after.png' });
  const { docWidth, scrollWidth } = await page.evaluate(() => ({ docWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  console.log(`width=${width} scrollWidth=${scrollWidth} ${scrollWidth>docWidth?'OVERFLOW':'OK'}`);
  await page.close();
}
await browser.close();
