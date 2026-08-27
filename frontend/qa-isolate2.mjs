import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  const docWidth = document.documentElement.clientWidth;
  const results = [];
  // Try hiding each top-level child of body/root one at a time, remeasure
  const root = document.getElementById('root') || document.body;
  const walk = (el, path) => {
    const prevDisplay = el.style.display;
    el.style.display = 'none';
    const sw = document.documentElement.scrollWidth;
    el.style.display = prevDisplay;
    return sw;
  };
  const candidates = Array.from(root.querySelectorAll('body > *, #root > *, #root section, #root > div > *'));
  const seen = new Set();
  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    const sw = walk(el);
    results.push({
      tag: el.tagName,
      id: el.id,
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
      scrollWidthWhenHidden: sw,
    });
  }
  return { docWidth, baseline: document.documentElement.scrollWidth, results };
});

console.log('docWidth', info.docWidth, 'baseline scrollWidth', info.baseline);
for (const r of info.results) {
  const mark = r.scrollWidthWhenHidden < info.baseline ? '  <-- CONTRIBUTES' : '';
  console.log(`${r.tag} #${r.id} .${r.cls}  => ${r.scrollWidthWhenHidden}${mark}`);
}
await browser.close();
