// Escenario C — Empresas (Fase 5). Sesión autenticada de la dueña comercial del
// remate (rol `empresa`, ADR-047): login -> dashboard (sus remates) -> detalle ->
// lotes -> analítica en vivo -> auditoría. Todo lectura -- "operaciones
// administrativas no destructivas" ya está cubierto por el propio dashboard (no hay
// necesidad de cancelar/editar un remate real para simular carga administrativa; eso
// sería destructivo sobre el fixture que otros escenarios también usan).
//
// Uso:
//   k6 run k6/scenarios/companies.js
//   k6 run --vus 20 --duration 1m k6/scenarios/companies.js

import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from '../lib/config.js';
import { ensureEmpresa } from '../lib/identity.js';
import { ensureLiveFixture } from '../lib/fixtures.js';
import { DEFAULT_HTTP_P95_MS, MAX_ERROR_RATE } from '../lib/thresholds.js';
import { think } from '../lib/util.js';

export const options = {
  scenarios: {
    companies: {
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
  const fixture = ensureLiveFixture(empresa);
  return { empresa, remateId: fixture.remateId };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.empresa.accessToken}` };

  const dashboardRes = http.get(
    `${API_BASE_URL}/remates?owner_id=${data.empresa.userId}&page_size=20`,
    { headers, tags: { name: 'dashboard_remates' } }
  );
  check(dashboardRes, { 'dashboard remates propios: 200': (r) => r.status === 200 });
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
  check(lotesRes, { 'listado lotes propios: 200': (r) => r.status === 200 });
  think(0.5, 1.5);

  const analyticsRes = http.get(`${API_BASE_URL}/remates/${data.remateId}/analytics`, {
    headers,
    tags: { name: 'analytics' },
  });
  check(analyticsRes, { 'analítica en vivo: 200': (r) => r.status === 200 });
  think();

  const auditRes = http.get(`${API_BASE_URL}/remates/${data.remateId}/audit?page_size=20`, {
    headers,
    tags: { name: 'audit_log' },
  });
  check(auditRes, { 'auditoría del remate: 200': (r) => r.status === 200 });
}
