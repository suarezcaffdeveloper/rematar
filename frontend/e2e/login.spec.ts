import { test, expect } from '@playwright/test';

// Fase 11 -- credenciales sintéticas ya sembradas por k6 (Fase 4/5), mismo criterio
// de identificación (dominio rematar.io, prefijo "k6-") en las tres herramientas.
const BUYER_EMAIL = 'k6-buyer-00001@rematar.io';
const BUYER_PASSWORD = 'k6-buyer-pass-1234';

test('el login funciona', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(BUYER_EMAIL);
  await page.getByLabel('Contraseña').fill(BUYER_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('/');
  // Señal inequívoca de que la sesión prendió -- "Cerrar sesión" solo aparece
  // logueado. ("Entrar" a secas es ambiguo: la home también tiene botones como
  // "Entrar a la sala" por cada remate en vivo listado.)
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();

  expect(consoleErrors, `Errores de consola durante el login: ${consoleErrors.join('; ')}`).toEqual(
    []
  );
});

test('login con credenciales inválidas muestra un error, no una pantalla rota', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(BUYER_EMAIL);
  await page.getByLabel('Contraseña').fill('password-incorrecta');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
});
