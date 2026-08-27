import { chromium } from 'playwright';
async function login(request, email) {
  const res = await request.post('http://localhost:8000/api/v1/auth/login', { form: { username: email, password: 'QaTest123!' } });
  const tokens = await res.json();
  console.log('login response:', JSON.stringify(tokens).slice(0, 200));
  const meRes = await request.get('http://localhost:8000/api/v1/users/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const user = await meRes.json();
  console.log('me response:', JSON.stringify(user).slice(0,200));
  return { ...tokens, user };
}
const browser = await chromium.launch();
const context = await browser.newContext();
const auth = await login(context.request, 'qa-empresa@rematar-demo.com');
const page = await context.newPage();
page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
page.on('response', (res) => { if (res.status() >= 400) console.log('HTTP', res.status(), res.url()); });
await page.setViewportSize({ width: 320, height: 900 });
await page.addInitScript(({ auth }) => {
  localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
}, { auth });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const ls = await page.evaluate(() => localStorage.getItem('rematar-auth'));
console.log('localStorage after load:', ls?.slice(0, 300));
console.log('current URL:', page.url());
await browser.close();
