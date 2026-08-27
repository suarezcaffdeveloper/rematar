import { chromium } from 'playwright';
import fs from 'fs';
const tokens = JSON.parse(fs.readFileSync('qa-tokens.json', 'utf-8'));

const browser = await chromium.launch();
const context = await browser.newContext();

async function shot(auth, url, name, width = 320) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 700 });
  await page.addInitScript(({ auth }) => {
    localStorage.setItem('rematar-auth', JSON.stringify({ state: { accessToken: auth.access_token, refreshToken: auth.refresh_token, user: auth.user }, version: 0 }));
  }, { auth });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `D:/proyectos/RematAR/scratchpad/${name}.png` });
  const { docWidth, scrollWidth } = await page.evaluate(() => ({ docWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  console.log(name, 'scrollWidth', scrollWidth, scrollWidth > docWidth ? 'OVERFLOW' : 'OK');
  await page.close();
}

const empresa = tokens['qa-empresa@rematar-demo.com'];
const comprador = tokens['qa-comprador@rematar-demo.com'];

await shot(comprador, 'http://localhost:5173/mis-compras', 'mis_compras_320_after');
await shot(empresa, 'http://localhost:5173/ventas-adjudicadas', 'ventas_adjudicadas_320_after');
await shot(empresa, 'http://localhost:5173/remates/a8f04735-2b1b-4b3d-a4ba-fbeabdf87cb6/auditoria', 'remate_auditoria_320_after');

await browser.close();
