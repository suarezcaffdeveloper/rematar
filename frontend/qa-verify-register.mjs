import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const width of [320, 375, 428, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://localhost:5173/register', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const { docWidth, scrollWidth } = await page.evaluate(() => ({ docWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  console.log(`width=${width} scrollWidth=${scrollWidth} ${scrollWidth>docWidth?'OVERFLOW':'OK'}`);
  await page.close();
}
await browser.close();
