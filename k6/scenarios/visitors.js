// Escenario A — Visitantes (Fase 5). Navegación 100% anónima: sin login, sin datos
// de prueba propios más allá de que exista al menos un remate LIVE visible (lo
// garantiza el fixture de k6/lib/fixtures.js, sembrado por cualquiera de los otros
// escenarios, o corriendo primero `k6 run smoke-test.js`).
//
// Flujo real de un visitante: entra al sitio -> consulta remates -> abre uno ->
// consulta lotes -> abre el detalle de un lote -> mira si ya hay una oferta vigente.
// Nunca la misma request repetida -- cada paso es un endpoint distinto, con tiempo de
// lectura simulado entre pasos (k6/lib/util.js:think).
//
// Uso:
//   k6 run k6/scenarios/visitors.js
//   k6 run -e BASE_URL=http://localhost:8000 --vus 50 --duration 1m k6/scenarios/visitors.js

import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from '../lib/config.js';
import { DEFAULT_HTTP_P95_MS, MAX_ERROR_RATE } from '../lib/thresholds.js';
import { pickRandom, think } from '../lib/util.js';

export const options = {
  scenarios: {
    visitors: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${DEFAULT_HTTP_P95_MS}`],
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
  },
};

export default function () {
  const listRes = http.get(`${API_BASE_URL}/remates?status=live&page_size=10`, {
    tags: { name: 'list_remates' },
  });
  check(listRes, { 'listado remates: 200': (r) => r.status === 200 });
  think();

  const remate = pickRandom(listRes.json('items'));
  if (!remate) {
    return; // No hay ningún remate LIVE sembrado todavía -- correr smoke-test.js primero.
  }

  const detailRes = http.get(`${API_BASE_URL}/remates/${remate.id}`, {
    tags: { name: 'remate_detail' },
  });
  check(detailRes, { 'detalle remate: 200': (r) => r.status === 200 });
  think();

  const lotesRes = http.get(`${API_BASE_URL}/remates/${remate.id}/lotes?page_size=10`, {
    tags: { name: 'list_lotes' },
  });
  check(lotesRes, { 'listado lotes: 200': (r) => r.status === 200 });
  think();

  const lote = pickRandom(lotesRes.json('items'));
  if (!lote) {
    return;
  }

  const loteDetailRes = http.get(`${API_BASE_URL}/remates/${remate.id}/lotes/${lote.id}`, {
    tags: { name: 'lote_detail' },
  });
  check(loteDetailRes, { 'detalle lote: 200': (r) => r.status === 200 });
  think(0.5, 1.5);

  const leadingRes = http.get(
    `${API_BASE_URL}/remates/${remate.id}/lotes/${lote.id}/ofertas/leading`,
    { tags: { name: 'leading_offer' } }
  );
  check(leadingRes, { 'oferta vigente: 200': (r) => r.status === 200 });
}
