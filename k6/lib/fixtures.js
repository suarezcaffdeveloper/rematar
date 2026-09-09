// Datos de prueba mínimos para los escenarios HTTP-only de k6 (Fase 4 del plan de
// pruebas de carga): un remate LIVE con un lote OPEN, propiedad de la empresa
// sintética (k6/lib/identity.js:ensureEmpresa), y un martillero asignado vía código
// de operador (ADR-048) -- todo vía la API pública, mismo criterio que
// loadtest/loadtest/fixtures.py.
//
// A diferencia de loadtest/fixtures.py (que crea un remate NUEVO por corrida, con un
// título único por UUID -- correcto para bid_storm/connected_buyers, que necesitan
// aislar cada corrida), acá el objetivo son escenarios de LECTURA (listado/detalle de
// remates y lotes) donde no tiene sentido acumular un remate sintético nuevo en cada
// ejecución de k6: `ensureLiveFixture` busca primero si ya existe uno propio de esta
// empresa antes de crear uno, así corridas repetidas reutilizan el mismo dato en vez
// de inflar la tabla de remates sin límite (ver docs/39, "los datos de prueba no se
// limpian automáticamente" -- esto mitiga esa limitación para el caso de k6).

import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from './config.js';

const FIXTURE_TITLE = 'K6 Remate Demo';
const FIXTURE_LOT_TITLE = 'K6 Lote Demo';

function authHeaders(accessToken) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

function findExistingLiveFixture(empresa) {
  const listRes = http.get(
    `${API_BASE_URL}/remates?owner_id=${empresa.userId}&status=live&page_size=5`,
    { headers: authHeaders(empresa.accessToken), tags: { name: 'find_fixture_remate' } }
  );
  if (listRes.status !== 200) {
    return null;
  }
  const items = listRes.json('items') || [];
  const remate = items.find((r) => r.title === FIXTURE_TITLE);
  if (!remate) {
    return null;
  }

  const lotesRes = http.get(`${API_BASE_URL}/remates/${remate.id}/lotes?page_size=5`, {
    headers: authHeaders(empresa.accessToken),
    tags: { name: 'find_fixture_lote' },
  });
  if (lotesRes.status !== 200) {
    return null;
  }
  const lotes = lotesRes.json('items') || [];
  const lote = lotes.find((l) => l.status === 'open');
  if (!lote) {
    return null;
  }
  return { remateId: remate.id, loteId: lote.id };
}

function createLiveFixture(empresa) {
  const headers = authHeaders(empresa.accessToken);

  // `schedule` (más abajo) exige starts_at futuro -- mismo patrón que
  // loadtest/loadtest/fixtures.py (+5s alcanza para que "start" ya lo encuentre
  // vencido cuando corre, unos milisegundos después).
  const startsAt = new Date(Date.now() + 5000).toISOString();
  const remateRes = http.post(
    `${API_BASE_URL}/remates`,
    JSON.stringify({ title: FIXTURE_TITLE, category: 'mercaderia_e_indumentaria', starts_at: startsAt }),
    { headers, tags: { name: 'create_fixture_remate' } }
  );
  check(remateRes, { 'create remate: 201': (r) => r.status === 201 });
  const remateId = remateRes.json('id');

  const loteRes = http.post(
    `${API_BASE_URL}/remates/${remateId}/lotes`,
    JSON.stringify({
      lot_number: '1',
      title: FIXTURE_LOT_TITLE,
      category: 'mercaderia_e_indumentaria',
      base_price: '100.00',
      min_increment: '1.00',
    }),
    { headers, tags: { name: 'create_fixture_lote' } }
  );
  check(loteRes, { 'create lote: 201': (r) => r.status === 201 });
  const loteId = loteRes.json('id');

  check(
    http.post(`${API_BASE_URL}/remates/${remateId}/schedule`, null, {
      headers,
      tags: { name: 'schedule_fixture_remate' },
    }),
    { 'schedule remate: 200': (r) => r.status === 200 }
  );
  check(
    http.post(`${API_BASE_URL}/remates/${remateId}/start`, null, {
      headers,
      tags: { name: 'start_fixture_remate' },
    }),
    { 'start remate: 200': (r) => r.status === 200 }
  );
  check(
    http.post(`${API_BASE_URL}/remates/${remateId}/lotes/${loteId}/open`, null, {
      headers,
      tags: { name: 'open_fixture_lote' },
    }),
    { 'open lote: 200': (r) => r.status === 200 }
  );

  return { remateId, loteId };
}

// Idempotente: reusa el remate/lote LIVE+OPEN de la empresa sintética si ya existe
// (misma corrida repetida, o corrida anterior el mismo día); si no, lo crea. Llamar
// desde `setup()`, una sola vez por corrida -- nunca desde dentro de una iteración de
// VU.
export function ensureLiveFixture(empresa) {
  return findExistingLiveFixture(empresa) || createLiveFixture(empresa);
}

// Asigna al martillero sintético (k6/lib/identity.js:ensureRematador) como operador
// del remate -- ADR-048: la empresa genera un código de un solo uso, el rematador lo
// canjea. Idempotente en la práctica: `claim_operator` rechaza el canje si ya está
// operando OTRO rematador, pero canjear el mismo código dos veces con el MISMO
// rematador ya asignado no debería probarse acá (no es el objetivo de este fixture) --
// si el rematador ya está asignado (409), se tolera igual que un dato ya sembrado.
export function assignOperator(empresa, rematador, remateId) {
  const codeRes = http.post(`${API_BASE_URL}/remates/${remateId}/operator-code`, null, {
    headers: authHeaders(empresa.accessToken),
    tags: { name: 'generate_operator_code' },
  });
  check(codeRes, { 'generate operator code: 200': (r) => r.status === 200 });
  const code = codeRes.json('code');

  const claimRes = http.post(
    `${API_BASE_URL}/remates/${remateId}/claim-operator`,
    JSON.stringify({ code }),
    {
      headers: authHeaders(rematador.accessToken),
      tags: { name: 'claim_operator' },
      // Mismo criterio que auth_register en identity.js: 409 (ya asignado) es
      // esperado en una corrida repetida, no debe ensuciar http_req_failed.
      responseCallback: http.expectedStatuses(200, 409),
    }
  );
  check(claimRes, {
    'claim operator: 200 (asignado) o 409 (ya asignado)': (r) => r.status === 200 || r.status === 409,
  });
}
