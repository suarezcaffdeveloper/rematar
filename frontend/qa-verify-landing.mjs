import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const width of [320, 375, 428, 768, 1024, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const { docWidth, scrollWidth } = await page.evaluate(() => ({
    docWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  console.log(`width=${width}  docWidth=${docWidth}  scrollWidth=${scrollWidth}  ${scrollWidth > docWidth ? 'OVERFLOW ' + (scrollWidth-docWidth) + 'px' : 'OK'}`);
  await page.close();
}
await browser.close();
