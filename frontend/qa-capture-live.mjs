// Script QA temporal (no commitear) — captura screenshots full-page en varios anchos
// para el flujo de remate en vivo, inyectando sesión directo en localStorage.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const SHOTS_DIR = 'C:/Users/santi/AppData/Local/Temp/claude/D--proyectos-RematAR/bd9454b6-a0b9-4779-88e3-2cf06ec9088f/scratchpad/shots';
const BASE_URL = 'http://localhost:5173';
const WIDTHS = [320, 360, 375, 390, 414, 428, 768, 1024, 1440];

const TOKENS = JSON.parse(fs.readFileSync(
  'C:/Users/santi/AppData/Local/Temp/claude/D--proyectos-RematAR/bd9454b6-a0b9-4779-88e3-2cf06ec9088f/scratchpad/tmp/tokens.json',
  'utf-8',
));

function authInitScript(role) {
  const t = TOKENS[role];
  const authState = {
    state: { accessToken: t.access_token, refreshToken: t.refresh_token, user: t.user },
    version: 0,
  };
  return (state) => {
    window.localStorage.setItem('rematar-auth', JSON.stringify(state));
  };
}

async function shoot(context, role, name, path, widths = WIDTHS) {
  const page = await context.newPage();
  if (role) {
    const t = TOKENS[role];
    const authState = { state: { accessToken: t.access_token, refreshToken: t.refresh_token, user: t.user }, version: 0 };
    await page.addInitScript((s) => window.localStorage.setItem('rematar-auth', s), JSON.stringify(authState));
  }
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE_URL + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS_DIR}/${name}_${w}.png`, fullPage: true });
    console.log(`${name}_${w}.png OK (scrollWidth check pending)`);
  }
  await page.close();
}

const browser = await chromium.launch();
const context = await browser.newContext();

const REMATE_ID = process.env.REMATE_ID;
const LOTE1 = process.env.LOTE1;

await shoot(context, 'rematador', '10_operator_claim_assigned', '/');
await shoot(context, 'empresa', '11_consola_operativa_empresa', `/remates/${REMATE_ID}/gestionar`);
await shoot(context, 'rematador', '12_consola_operativa_rematador', `/remates/${REMATE_ID}/gestionar`);
await shoot(context, 'comprador', '13_remate_detail', `/remates/${REMATE_ID}`);
await shoot(context, 'comprador', '14_sala_en_vivo', `/remates/${REMATE_ID}/sala`);

await context.close();
await browser.close();
console.log('DONE');
