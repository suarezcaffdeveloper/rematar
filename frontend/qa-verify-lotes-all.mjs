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

for (const width of [320, 360, 375, 390, 414, 428, 768, 1024, 1440]) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
  }, { auth });
  await page.goto(`http://localhost:5173/remates/${REMATE_ID}/lotes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const { docWidth, scrollWidth } = await page.evaluate(() => ({
    docWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  console.log(`width=${width}  scrollWidth=${scrollWidth}  ${scrollWidth > docWidth ? 'OVERFLOW ' + (scrollWidth-docWidth) + 'px' : 'OK'}`);
  await page.close();
}
await browser.close();
