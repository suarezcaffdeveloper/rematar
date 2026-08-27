// Script QA temporal (no commitear) — capturas interactivas: campanita de notificaciones,
// tabs CHAT/CONECTADOS/MODERACIÓN en Consola Operativa, tab CHAT en Sala.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const SHOTS_DIR = 'C:/Users/santi/AppData/Local/Temp/claude/D--proyectos-RematAR/bd9454b6-a0b9-4779-88e3-2cf06ec9088f/scratchpad/shots';
const BASE_URL = 'http://localhost:5173';
const WIDTHS = [320, 375, 428, 1024];

const TOKENS = JSON.parse(fs.readFileSync(
  'C:/Users/santi/AppData/Local/Temp/claude/D--proyectos-RematAR/bd9454b6-a0b9-4779-88e3-2cf06ec9088f/scratchpad/tmp/tokens.json',
  'utf-8',
));

const REMATE_ID = 'a8f04735-2b1b-4b3d-a4ba-fbeabdf87cb6';

async function newAuthedPage(context, role) {
  const page = await context.newPage();
  const t = TOKENS[role];
  const authState = { state: { accessToken: t.access_token, refreshToken: t.refresh_token, user: t.user }, version: 0 };
  await page.addInitScript((s) => window.localStorage.setItem('rematar-auth', s), JSON.stringify(authState));
  return page;
}

const browser = await chromium.launch();
const context = await browser.newContext();

// --- Notification bell dropdown, empresa, /perfil (tiene campanita en el header) ---
for (const w of WIDTHS) {
  const page = await newAuthedPage(context, 'empresa');
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(BASE_URL + '/perfil', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const bell = page.locator('button[aria-label*="otificaci" i], button:has(svg.lucide-bell)').first();
  try {
    await bell.click({ timeout: 3000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS_DIR}/26_notif_bell_open_${w}.png`, fullPage: false });
    console.log(`26_notif_bell_open_${w}.png OK`);
  } catch (e) {
    console.log(`26_notif_bell_open_${w}.png FAILED: ${e.message}`);
  }
  await page.close();
}

// --- Consola Operativa: tabs CHAT / CONECTADOS / MODERACIÓN, rematador ---
for (const w of WIDTHS) {
  const page = await newAuthedPage(context, 'rematador');
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(BASE_URL + `/remates/${REMATE_ID}/gestionar`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS_DIR}/27_consola_tab_chat_${w}.png`, fullPage: true });

  for (const tabName of ['CONECTADOS', 'MODERACIÓN', 'MODERACION']) {
    const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') }).first();
    if (await tab.count() > 0) {
      try {
        await tab.click({ timeout: 2000 });
        await page.waitForTimeout(400);
        const safe = tabName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        await page.screenshot({ path: `${SHOTS_DIR}/28_consola_tab_${safe}_${w}.png`, fullPage: true });
        console.log(`28_consola_tab_${safe}_${w}.png OK`);
      } catch (e) {
        console.log(`tab ${tabName} @ ${w} FAILED: ${e.message}`);
      }
    }
  }
  await page.close();
}

// --- Sala en vivo: tab CHAT, comprador ---
for (const w of WIDTHS) {
  const page = await newAuthedPage(context, 'comprador');
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(BASE_URL + `/remates/${REMATE_ID}/sala`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const chatTab = page.getByRole('tab', { name: /chat/i }).first();
  if (await chatTab.count() > 0) {
    try {
      await chatTab.click({ timeout: 2000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS_DIR}/29_sala_tab_chat_${w}.png`, fullPage: true });
      console.log(`29_sala_tab_chat_${w}.png OK`);
    } catch (e) {
      console.log(`sala chat tab @ ${w} FAILED: ${e.message}`);
    }
  } else {
    console.log(`sala chat tab @ ${w}: no tab found (ya visible?)`);
    await page.screenshot({ path: `${SHOTS_DIR}/29_sala_tab_chat_${w}.png`, fullPage: true });
  }
  await page.close();
}

await context.close();
await browser.close();
console.log('DONE INTERACTIVE');
