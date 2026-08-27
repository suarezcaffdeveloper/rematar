import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE_URL = 'http://localhost:5173';
const WIDTHS = [320, 360, 375, 390, 414, 428, 768, 1024, 1440];
const TOKENS = JSON.parse(fs.readFileSync(
  'C:/Users/santi/AppData/Local/Temp/claude/D--proyectos-RematAR/bd9454b6-a0b9-4779-88e3-2cf06ec9088f/scratchpad/tmp/tokens.json',
  'utf-8',
));

const CASE_ID = '1a052fc3-29b0-416b-8612-335ab6b1bf08';
const REMATE_ID = 'a8f04735-2b1b-4b3d-a4ba-fbeabdf87cb6';

const TARGETS = [
  { name: 'mis_compras_list', role: 'comprador', path: '/mis-compras' },
  { name: 'mis_compras_detail', role: 'comprador', path: `/mis-compras/${CASE_ID}` },
  { name: 'ventas_adjudicadas_list', role: 'empresa', path: '/ventas-adjudicadas' },
  { name: 'ventas_adjudicadas_detail', role: 'empresa', path: `/ventas-adjudicadas/${CASE_ID}` },
  { name: 'perfil_empresa', role: 'empresa', path: '/perfil' },
  { name: 'perfil_rematador', role: 'rematador', path: '/perfil' },
  { name: 'perfil_comprador', role: 'comprador', path: '/perfil' },
  { name: 'operator_claim_empty', role: 'rematador2', path: '/' },
  { name: 'historial_list', role: 'empresa', path: '/historial' },
  { name: 'simuladores', role: 'empresa', path: '/simuladores' },
  { name: 'remate_auditoria', role: 'empresa', path: `/remates/${REMATE_ID}/auditoria` },
];

const browser = await chromium.launch();
const context = await browser.newContext();

for (const t of TARGETS) {
  const page = await context.newPage();
  const tok = TOKENS[t.role];
  const authState = { state: { accessToken: tok.access_token, refreshToken: tok.refresh_token, user: tok.user }, version: 0 };
  await page.addInitScript((s) => window.localStorage.setItem('rematar-auth', s), JSON.stringify(authState));
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE_URL + t.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    const diff = scrollWidth - innerWidth;
    console.log(`${t.name} @ ${w}px -> scrollWidth=${scrollWidth} innerWidth=${innerWidth} diff=${diff}${diff > 2 ? '  <-- OVERFLOW' : ''}`);
  }
  await page.close();
}

await context.close();
await browser.close();
