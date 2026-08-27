// Script QA temporal (no commitear) — tanda 3: post-adjudicación, perfil, chat, notificaciones.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const SHOTS_DIR = 'C:/Users/santi/AppData/Local/Temp/claude/D--proyectos-RematAR/bd9454b6-a0b9-4779-88e3-2cf06ec9088f/scratchpad/shots';
const BASE_URL = 'http://localhost:5173';
const WIDTHS = [320, 360, 375, 390, 414, 428, 768, 1024, 1440];

const TOKENS = JSON.parse(fs.readFileSync(
  'C:/Users/santi/AppData/Local/Temp/claude/D--proyectos-RematAR/bd9454b6-a0b9-4779-88e3-2cf06ec9088f/scratchpad/tmp/tokens.json',
  'utf-8',
));

async function withAuth(context, role) {
  const page = await context.newPage();
  if (role) {
    const t = TOKENS[role];
    const authState = { state: { accessToken: t.access_token, refreshToken: t.refresh_token, user: t.user }, version: 0 };
    await page.addInitScript((s) => window.localStorage.setItem('rematar-auth', s), JSON.stringify(authState));
  }
  return page;
}

async function shootPath(context, role, name, path, widths = WIDTHS) {
  const page = await withAuth(context, role);
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(BASE_URL + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS_DIR}/${name}_${w}.png`, fullPage: true });
    console.log(`${name}_${w}.png OK`);
  }
  await page.close();
}

const browser = await chromium.launch();
const context = await browser.newContext();

const CASE_ID = '1a052fc3-29b0-416b-8612-335ab6b1bf08';
const REMATE_ID = 'a8f04735-2b1b-4b3d-a4ba-fbeabdf87cb6';

// 1-2: Post-adjudicación comprador
await shootPath(context, 'comprador', '15_mis_compras_list', '/mis-compras');
await shootPath(context, 'comprador', '16_mis_compras_detail', `/mis-compras/${CASE_ID}`);

// 3-4: Post-adjudicación empresa
await shootPath(context, 'empresa', '17_ventas_adjudicadas_list', '/ventas-adjudicadas');
await shootPath(context, 'empresa', '18_ventas_adjudicadas_detail', `/ventas-adjudicadas/${CASE_ID}`);

// 5: Perfil x3 roles
await shootPath(context, 'empresa', '19_perfil_empresa', '/perfil');
await shootPath(context, 'rematador', '20_perfil_rematador', '/perfil');
await shootPath(context, 'comprador', '21_perfil_comprador', '/perfil');

// 8: OperatorClaimPage vacío (rematador2, nunca canjeó código)
await shootPath(context, 'rematador2', '22_operator_claim_empty', '/');

// Bonus screens nuevas descubiertas en el router
await shootPath(context, 'empresa', '23_historial_list', '/historial');
await shootPath(context, 'empresa', '24_simuladores', '/simuladores');
await shootPath(context, 'empresa', '25_remate_auditoria', `/remates/${REMATE_ID}/auditoria`);

await context.close();
await browser.close();
console.log('DONE PART3');
