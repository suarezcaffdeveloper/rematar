import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const baseline = await page.evaluate(() => document.documentElement.scrollWidth);
console.log('baseline scrollWidth:', baseline);

// Hide the two decorative blobs
const afterBlobs = await page.evaluate(() => {
  document.querySelectorAll('.blur-3xl').forEach((el) => (el.style.display = 'none'));
  return document.documentElement.scrollWidth;
});
console.log('after hiding .blur-3xl blobs:', afterBlobs);

// Additionally hide the carousel section (WhatIsSection) entirely - find by heading text
const afterCarousel = await page.evaluate(() => {
  const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent?.includes('Qué es RematAR'));
  const section = heading?.closest('section');
  if (section) section.style.display = 'none';
  return document.documentElement.scrollWidth;
});
console.log('after also hiding WhatIsSection:', afterCarousel);

await browser.close();
