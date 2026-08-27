import { chromium } from 'playwright';
import fs from 'fs';
const tokens = JSON.parse(fs.readFileSync('qa-tokens.json', 'utf-8'));
const auth = tokens['qa-empresa@rematar-demo.com'];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width: 320, height: 700 });
await page.addInitScript(({ auth }) => {
  localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
}, { auth });
await page.goto('http://localhost:5173/remates/a8f04735-2b1b-4b3d-a4ba-fbeabdf87cb6/auditoria', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const docWidth = document.documentElement.clientWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  const nav = document.querySelector('nav[aria-label="Ruta de navegación"]');
  const lastSpan = nav ? nav.lastElementChild : null;
  const innerSpan = lastSpan ? lastSpan.querySelector('span[title]') : null;
  const dump = (el) => el ? {
    tag: el.tagName, cls: el.className, rect: el.getBoundingClientRect().toJSON(),
    cs_minWidth: getComputedStyle(el).minWidth, cs_overflow: getComputedStyle(el).overflow,
    cs_whiteSpace: getComputedStyle(el).whiteSpace, cs_textOverflow: getComputedStyle(el).textOverflow,
    cs_display: getComputedStyle(el).display, cs_flexShrink: getComputedStyle(el).flexShrink,
  } : null;
  return {
    docWidth, scrollWidth,
    nav: dump(nav), lastSpan: dump(lastSpan), innerSpan: dump(innerSpan),
    navHTML: nav ? nav.outerHTML.slice(0, 800) : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
