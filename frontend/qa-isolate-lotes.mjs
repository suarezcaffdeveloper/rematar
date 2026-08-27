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
await page.setViewportSize({ width: 1024, height: 900 });
await page.addInitScript(({ auth }) => {
  localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
}, { auth });
await page.goto(`http://localhost:5173/remates/${REMATE_ID}/lotes`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

const result = await page.evaluate(() => {
  const docWidth = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right <= docWidth + 1 && r.left >= -1) return;
    let contained = false;
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflowX)) { contained = true; break; }
      p = p.parentElement;
    }
    if (contained) return;
    offenders.push({
      tag: el.tagName,
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 160),
      left: Math.round(r.left), right: Math.round(r.right),
    });
  });
  return { docWidth, scrollWidth: document.documentElement.scrollWidth, offenders };
});
console.log('docWidth', result.docWidth, 'scrollWidth', result.scrollWidth, 'offenders:', result.offenders.length);
for (const o of result.offenders.slice(0, 15)) console.log(`${o.tag} left=${o.left} right=${o.right}  class="${o.cls}"`);
await browser.close();
