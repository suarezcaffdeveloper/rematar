import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 768, height: 1000 } });
await page.goto('http://localhost:5173/register', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: 'D:/proyectos/RematAR/scratchpad/register_768_after.png' });
await browser.close();
