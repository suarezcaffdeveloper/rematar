import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const result = await page.evaluate(() => {
  const docWidth = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('main *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right <= docWidth + 1 && r.left >= -1) return;
    // check containment: walk ancestors, if any clips overflow-x, skip
    let contained = false;
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (['hidden', 'auto', 'scroll', 'clip'].includes(cs.overflowX)) {
        contained = true;
        break;
      }
      p = p.parentElement;
    }
    if (contained) return;
    offenders.push({
      tag: el.tagName,
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 160),
      left: Math.round(r.left),
      right: Math.round(r.right),
    });
  });
  return { docWidth, scrollWidth: document.documentElement.scrollWidth, offenders };
});

console.log('docWidth', result.docWidth, 'scrollWidth', result.scrollWidth, 'true offenders (not clipped by any ancestor):', result.offenders.length);
for (const o of result.offenders) {
  console.log(`${o.tag} left=${o.left} right=${o.right}  class="${o.cls}"`);
}
await browser.close();
