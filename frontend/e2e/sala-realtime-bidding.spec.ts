import { test, expect, type Page } from '@playwright/test';
import { getLiveFixture } from './support/fixture';

// Fase 11 -- flujo completo del enunciado en un solo test: login funciona, un usuario
// entra al remate, los lotes cargan, una puja se puede realizar, y las actualizaciones
// en tiempo real llegan correctamente a OTRO comprador conectado (sin que ese segundo
// comprador haga nada -- si el precio le cambia solo, el WebSocket funciona de punta a
// punta). Dos `BrowserContext` separados simulan dos personas distintas con sesiones
// independientes, cada una con su propio WebSocket.

const BUYER_A = { email: 'k6-buyer-00001@rematar.io', password: 'k6-buyer-pass-1234' };
const BUYER_B = { email: 'k6-buyer-00002@rematar.io', password: 'k6-buyer-pass-1234' };

async function loginAndOpenSala(
  page: Page,
  remateId: string,
  credentials: { email: string; password: string }
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Contraseña').fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL('/');
  await page.goto(`/remates/${remateId}/sala`);
}

// El precio actual vive en el <p> inmediatamente después del label "Oferta actual"/
// "Precio inicial" (ver SalaBidPanel.tsx) -- se ubica por estructura/texto, no por
// clases de Tailwind (frágil ante cualquier retoque visual).
function priceLocator(page: Page) {
  return page
    .locator('xpath=//p[contains(., "Oferta actual") or contains(., "Precio inicial")]/following-sibling::p[1]')
    .first();
}

test('sala en vivo: login, entrar al remate, lotes cargan, pujar, y otro comprador ve la actualización en tiempo real', async ({
  browser,
}) => {
  const fixture = await getLiveFixture();

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const consoleErrors: string[] = [];
  for (const p of [pageA, pageB]) {
    p.on('pageerror', (err) => consoleErrors.push(String(err)));
    p.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`${msg.text()}`);
    });
  }

  await loginAndOpenSala(pageA, fixture.remateId, BUYER_A);
  await loginAndOpenSala(pageB, fixture.remateId, BUYER_B);

  // Los lotes cargan: el panel de precio (que depende del snapshot inicial del lote
  // activo) tiene que quedar visible en ambas sesiones.
  await expect(priceLocator(pageA)).toBeVisible({ timeout: 10000 });
  await expect(priceLocator(pageB)).toBeVisible({ timeout: 10000 });

  const priceBeforeB = await priceLocator(pageB).textContent();

  // A oferta -- si ya viene liderando de una corrida anterior, primero hay que
  // confirmar "Ofertar de todos modos" para que aparezca el formulario.
  const leadingButton = pageA.getByRole('button', { name: 'Ofertar de todos modos' });
  if (await leadingButton.isVisible().catch(() => false)) {
    await leadingButton.click();
  }

  const bidForm = pageA.locator('form').filter({ has: pageA.getByRole('button', { name: 'Ofertar', exact: true }) });
  await bidForm.locator('.grid button').first().click(); // primera oferta sugerida, siempre válida
  await bidForm.getByRole('button', { name: 'Ofertar', exact: true }).click();

  // A ve la confirmación (respuesta directa de POST .../ofertas, no WebSocket).
  await expect(pageA.getByText(/fue aceptada/)).toBeVisible({ timeout: 10000 });

  // B, sin recargar ni tocar nada, ve el precio cambiar solo -- esto SOLO puede pasar
  // por el WebSocket (evento oferta.accepted reenviado por el Gateway).
  await expect(priceLocator(pageB)).not.toHaveText(priceBeforeB ?? '', { timeout: 10000 });

  expect(consoleErrors, `Errores de consola detectados: ${consoleErrors.join('; ')}`).toEqual([]);

  await contextA.close();
  await contextB.close();
});
