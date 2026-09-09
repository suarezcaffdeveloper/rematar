// Escenario D — Martilleros (Fase 5). Sesión autenticada del rol `rematador`
// (ADR-047/048): opera en vivo un remate ya asignado por la empresa (código de
// operador, `k6/lib/fixtures.js:assignOperator`). Login -> remates asignados ->
// detalle -> lotes -> estado completo (snapshot).
//
// Deliberadamente NO incluye pausar/reanudar/cerrar un lote (`POST .../timer/pause`,
// `.../timer/resume`, `.../close`): son las "operaciones propias del rol" reales,
// pero mutan el ÚNICO lote fixture compartido (`k6/lib/fixtures.js`) que también usan
// `buyers.js`/`visitors.js` y `loadtest/` en paralelo -- pausar ese lote mientras otro
// escenario está ofertando sobre él invalidaría esa corrida, no es "seguro para
// testing" en el sentido del enunciado (Fase 5: "operaciones... que sean seguras
// para testing"). Si hace falta medir esas acciones bajo carga, correrlas contra un
// remate/lote propio y descartable, no el fixture compartido.
//
// Uso:
//   k6 run k6/scenarios/auctioneers.js
//   k6 run --vus 10 --duration 1m k6/scenarios/auctioneers.js

import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from '../lib/config.js';
import { ensureEmpresa, ensureRematador } from '../lib/identity.js';
import { assignOperator, ensureLiveFixture } from '../lib/fixtures.js';
import { DEFAULT_HTTP_P95_MS, MAX_ERROR_RATE } from '../lib/thresholds.js';
import { think } from '../lib/util.js';

export const options = {
  scenarios: {
    auctioneers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 10 },
        { duration: '40s', target: 10 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${DEFAULT_HTTP_P95_MS}`],
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
  },
};

export function setup() {
  const empresa = ensureEmpresa();
  const rematador = ensureRematador();
  const fixture = ensureLiveFixture(empresa);
  assignOperator(empresa, rematador, fixture.remateId);
  return { rematador, remateId: fixture.remateId, loteId: fixture.loteId };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.rematador.accessToken}` };

  const assignedRes = http.get(
    `${API_BASE_URL}/remates?rematador_id=${data.rematador.userId}&page_size=20`,
    { headers, tags: { name: 'remates_asignados' } }
  );
  check(assignedRes, { 'remates asignados: 200': (r) => r.status === 200 });
  think();

  const detailRes = http.get(`${API_BASE_URL}/remates/${data.remateId}`, {
    headers,
    tags: { name: 'remate_detail' },
  });
  check(detailRes, { 'detalle remate: 200': (r) => r.status === 200 });
  think(0.5, 1.5);

  const lotesRes = http.get(`${API_BASE_URL}/remates/${data.remateId}/lotes?page_size=20`, {
    headers,
    tags: { name: 'list_lotes' },
  });
  check(lotesRes, { 'listado lotes: 200': (r) => r.status === 200 });
  think(0.5, 1.5);

  const snapshotRes = http.get(`${API_BASE_URL}/remates/${data.remateId}/snapshot`, {
    headers,
    tags: { name: 'snapshot' },
  });
  check(snapshotRes, { 'estado completo (snapshot): 200': (r) => r.status === 200 });
}
