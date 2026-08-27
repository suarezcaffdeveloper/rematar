import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE_URL = 'http://localhost:5173';
const WIDTHS = [320, 360, 375, 390, 414, 428, 768, 1024, 1440];
const TOKENS = JSON.parse(fs.readFileSync(
  'C:/Users/santi/AppData/Local/Temp/claude/D--proyectos-RematAR/bd9454b6-a0b9-4779-88e3-2cf06ec9088f/scratchpad/tmp/tokens.json',
  'utf-8',
));

const REMATE_ID = process.env.REMATE_ID;

const TARGETS = [
  { name: 'operator_claim_assigned', role: 'rematador', path: '/' },
  { name: 'consola_operativa_empresa', role: 'empresa', path: `/remates/${REMATE_ID}/gestionar` },
  { name: 'consola_operativa_rematador', role: 'rematador', path: `/remates/${REMATE_ID}/gestionar` },
  { name: 'remate_detail', role: 'comprador', path: `/remates/${REMATE_ID}` },
  { name: 'sala_en_vivo', role: 'comprador', path: `/remates/${REMATE_ID}/sala` },
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
