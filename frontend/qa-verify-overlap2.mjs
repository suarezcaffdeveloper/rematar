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

for (const width of [320, 375, 768]) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 700 });
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
  }, { auth });
  await page.goto(`http://localhost:5173/remates/${REMATE_ID}/lotes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  // Find first lote card: heuristically, the element containing the search input's ancestor's sibling list,
  // or simpler: find element with text matching a lote title pattern "QA" (our test lotes) with role/border card styling.
  const doc = await page.evaluate(() => {
    const bar = document.querySelector('.fixed.bottom-6, .fixed.inset-x-0.bottom-0');
    const barRect = bar.getBoundingClientRect();
    // heuristic: cards are direct children of the div.flex.flex-col.gap-3 that follows the search row
    const editButtons = [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Editar' || b.getAttribute('aria-label')?.includes('Editar'));
    let firstCard = null;
    if (editButtons.length) {
      firstCard = editButtons[0].closest('[class*="rounded"]') || editButtons[0].parentElement;
      while (firstCard && firstCard.parentElement && !firstCard.className.includes('border')) {
        firstCard = firstCard.parentElement;
      }
    }
    const scrollHeight = document.documentElement.scrollHeight;
    const viewportH = window.innerHeight;
    const cardRectAtScroll0 = firstCard ? firstCard.getBoundingClientRect() : null;
    const cardDocTop = cardRectAtScroll0 ? cardRectAtScroll0.top + window.scrollY : null;
    const cardDocBottom = cardRectAtScroll0 ? cardRectAtScroll0.bottom + window.scrollY : null;
    return {
      barFixedTop: barRect.top, barFixedBottom: barRect.bottom,
      cardDocTop, cardDocBottom, scrollHeight, viewportH,
      foundCard: !!firstCard, cardText: firstCard?.textContent?.slice(0,80),
    };
  });
  console.log(`\nwidth=${width}`, JSON.stringify(doc, null, 0));

  if (doc.foundCard) {
    // The bar occupies screen-space [barFixedTop, barFixedBottom] at ANY scroll position.
    // The card overlaps the bar for some scroll position S if:
    //   card's on-screen top/bottom at scroll S = cardDocTop - S .. cardDocBottom - S
    //   overlap condition: (cardDocTop - S) < barFixedBottom AND (cardDocBottom - S) > barFixedTop
    //   => S > cardDocTop - barFixedBottom AND S < cardDocBottom - barFixedTop
    const sMin = doc.cardDocTop - doc.barFixedBottom;
    const sMax = doc.cardDocBottom - doc.barFixedTop;
    const maxScroll = doc.scrollHeight - doc.viewportH;
    const clampedMin = Math.max(sMin, 0);
    const clampedMax = Math.min(sMax, maxScroll);
    const overlapPossible = clampedMin < clampedMax;
    console.log(`  overlap scroll range: [${sMin.toFixed(0)}, ${sMax.toFixed(0)}] within valid scroll [0, ${maxScroll}] => REAL OVERLAP POSSIBLE: ${overlapPossible}`);
  }
  await page.close();
}
await context.close();
await browser.close();
