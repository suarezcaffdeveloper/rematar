// Fase 11 -- helper de datos para los tests de Playwright. Mismo criterio de
// identificación que k6/lib (Fase 4): dominio rematar.io, prefijo "k6-" reutilizado
// tal cual para no crear una cuarta convención de datos sintéticos -- los tests de
// Playwright corren sobre el mismo remate/lote fixture que ya siembran k6/lib/fixtures.js
// y k6/smoke-test.js (empresa "K6 Empresa", remate "K6 Remate Demo").
//
// Habla con la API pública igual que cualquier otro cliente (nunca acceso directo a la
// base) -- mismo criterio que loadtest/ y k6/ (ver ADR-042 sección D).

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8000/api/v1';
const EMPRESA_EMAIL = 'k6-empresa@rematar.io';
const EMPRESA_PASSWORD = 'k6-empresa-pass-1234';
const FIXTURE_TITLE = 'K6 Remate Demo';

export interface LiveFixture {
  remateId: string;
  loteId: string;
}

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password }),
  });
  if (!response.ok) {
    throw new Error(`No se pudo loguear ${email}: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

/** Reutiliza el remate/lote fixture LIVE+OPEN ya sembrado por k6 -- corré
 * `k6 run k6/smoke-test.js` (o cualquier escenario de `k6/scenarios/`) antes de estos
 * tests si todavía no existe en el entorno contra el que corrés. */
export async function getLiveFixture(): Promise<LiveFixture> {
  const token = await login(EMPRESA_EMAIL, EMPRESA_PASSWORD);
  const headers = { Authorization: `Bearer ${token}` };

  const meResponse = await fetch(`${API_BASE_URL}/users/me`, { headers });
  const me = (await meResponse.json()) as { id: string };

  const rematesResponse = await fetch(
    `${API_BASE_URL}/remates?owner_id=${me.id}&status=live&page_size=5`,
    { headers }
  );
  const remates = (await rematesResponse.json()) as { items: { id: string; title: string }[] };
  const remate = remates.items.find((r) => r.title === FIXTURE_TITLE);
  if (!remate) {
    throw new Error(
      `No existe el remate fixture "${FIXTURE_TITLE}" -- corré k6/smoke-test.js primero.`
    );
  }

  const lotesResponse = await fetch(`${API_BASE_URL}/remates/${remate.id}/lotes?page_size=5`, {
    headers,
  });
  const lotes = (await lotesResponse.json()) as { items: { id: string; status: string }[] };
  const lote = lotes.items.find((l) => l.status === 'open');
  if (!lote) {
    throw new Error(`El remate fixture "${FIXTURE_TITLE}" no tiene ningún lote abierto.`);
  }

  return { remateId: remate.id, loteId: lote.id };
}
