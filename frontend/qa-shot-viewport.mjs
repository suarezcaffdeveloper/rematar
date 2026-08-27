import { chromium } from 'playwright';

async function login(request, email) {
  const res = await request.post('http://localhost:8000/api/v1/auth/login', {
    form: { username: email, password: 'QaTest123!' },
  });
  return res.json();
}

const browser = await chromium.launch();
const context = await browser.newContext();
const auth = await login(context.request, 'qa-empresa@rematar-demo.com');
const REMATE_ID = '4a2d15e5-43cb-4c63-8bcf-c058aec91e7b';

const page = await context.newPage();
await page.setViewportSize({ width: 320, height: 700 });
await page.addInitScript(({ auth }) => {
  localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
}, { auth });
await page.goto(`http://localhost:5173/remates/${REMATE_ID}/lotes`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await page.screenshot({ path: '../scratchpad/verify_320_viewport_top.png' });
await page.mouse.wheel(0, 400);
await page.waitForTimeout(300);
await page.screenshot({ path: '../scratchpad/verify_320_viewport_scrolled400.png' });
await page.mouse.wheel(0, 1000);
await page.waitForTimeout(300);
await page.screenshot({ path: '../scratchpad/verify_320_viewport_bottom.png' });
await browser.close();
