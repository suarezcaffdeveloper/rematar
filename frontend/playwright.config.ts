import { defineConfig, devices } from '@playwright/test';

// Playwright se usa únicamente para simular comportamiento real de navegador bajo
// carga controlada (login, entrar a la sala, ver lotes, ofertar, recibir
// actualizaciones en tiempo real) -- nunca como generador de carga masiva: eso es
// `loadtest/` (WebSocket/bidding) o `k6/` (HTTP puro). Ver docs/load-testing.md.
//
// Requiere el stack local levantado (`docker compose up -d` desde la raíz) --
// mismo criterio que `loadtest/` y `k6/`: nunca apuntar BASE_URL a un entorno que no
// sea local/de pruebas.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { outputFolder: 'e2e-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
