import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 320, height: 900 } });
await page.goto('http://localhost:5173/register', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: 'D:/proyectos/RematAR/scratchpad/register_320_before.png', fullPage: true });
await browser.close();
