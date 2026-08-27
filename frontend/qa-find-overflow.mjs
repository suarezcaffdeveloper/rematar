import { chromium } from 'playwright';

const browser = await chromium.launch();
for (const width of [375, 1024]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const result = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const offenders = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > docWidth + 1 || r.left < -1) {
        offenders.push({
          tag: el.tagName,
          cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 140) : '',
          left: Math.round(r.left),
          right: Math.round(r.right),
          width: Math.round(r.width),
        });
      }
    });
    return { docWidth, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 20) };
  });
  console.log(`\n=== width ${width}px === docWidth=${result.docWidth} scrollWidth=${result.scrollWidth}`);
  for (const o of result.offenders) {
    console.log(`${o.tag} left=${o.left} right=${o.right} w=${o.width}  class="${o.cls}"`);
  }
  await page.close();
}
await browser.close();
