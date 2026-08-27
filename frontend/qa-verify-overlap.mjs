import { chromium } from 'playwright';

async function login(request, email) {
  const res = await request.post('http://localhost:8000/api/v1/auth/login', {
    form: { username: email, password: 'QaTest123!' },
  });
  const body = await res.json();
  return body;
}

const browser = await chromium.launch();
const context = await browser.newContext();
const auth = await login(context.request, 'qa-empresa@rematar-demo.com');

const REMATE_ID = '4a2d15e5-43cb-4c63-8bcf-c058aec91e7b'; // draft remate w/ 4 lotes, from fork1

for (const width of [320, 375, 768]) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 700 });
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
  }, { auth });
  await page.goto(`http://localhost:5173/remates/${REMATE_ID}/lotes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  const info = await page.evaluate(() => {
    const bar = document.querySelector('.fixed.bottom-6, .fixed.inset-x-0.bottom-0');
    const firstCard = document.querySelector('main, [class*="flex-col"] h2')?.closest('div')?.parentElement;
    // find first lote card heuristically: any element containing "Editar" button inside a card-like border
    const cards = [...document.querySelectorAll('div')].filter(d => d.className.includ && false);
    const barRect = bar ? bar.getBoundingClientRect() : null;
    return { barRect, hasBar: !!bar, scrollHeight: document.documentElement.scrollHeight, viewportH: window.innerHeight };
  });
  console.log(`\nwidth=${width}`, JSON.stringify(info));

  // scroll to very top and check what's under the bar's screen position
  if (info.barRect) {
    const overlap = await page.evaluate((barRect) => {
      const cx = barRect.left + barRect.width / 2;
      const cy = barRect.top + barRect.height / 2;
      const el = document.elementFromPoint(cx, cy);
      return { tag: el?.tagName, cls: (el?.className || '').toString().slice(0,100), text: el?.textContent?.slice(0,60) };
    }, info.barRect);
    console.log('element under bar center at scrollY=0:', overlap);
  }
  await page.close();
}
await context.close();
await browser.close();
