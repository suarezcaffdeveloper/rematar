// Fase 9 — Spike test. Simula el escenario específico de RematAR descrito en el
// enunciado: la plataforma pasa rápido de poca carga a un pico grande (ej. arranca un
// remate popular) y hay que ver si el sistema absorbe el pico y se RECUPERA después,
// no solo cómo se comporta en el pico en sí (eso ya lo mide la Fase 7/8).
//
// Reusa el mismo flujo de `buyers.js` (setup/identidades/fixture) -- lo único que
// cambia es el perfil de carga: en vez de un nivel constante, son saltos abruptos.
// A diferencia de un override por CLI (--vus/--duration), esta forma (subir, bajar,
// volver a subir) solo se puede expresar con `stages` en el archivo.
//
// Uso: k6 run k6/scenarios/spike.js

import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from '../lib/config.js';
import { ensureBuyer, ensureEmpresa } from '../lib/identity.js';
import { ensureLiveFixture } from '../lib/fixtures.js';
import { pickRandom, think } from '../lib/util.js';

const NUM_BUYERS = Number(__ENV.NUM_BUYERS || 150);

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 50 }, // línea base
        { duration: '20s', target: 50 }, // sostener línea base -- referencia "antes"
        { duration: '10s', target: 500 }, // pico abrupto #1
        { duration: '20s', target: 500 }, // sostener el pico
        { duration: '10s', target: 1000 }, // pico abrupto #2, más alto
        { duration: '20s', target: 1000 },
        { duration: '10s', target: 2000 }, // pico abrupto #3 -- ya sabemos que esto rompe (Fase 7/8)
        { duration: '15s', target: 2000 },
        { duration: '10s', target: 50 }, // caída abrupta -- ¿se recupera?
        { duration: '30s', target: 50 }, // sostener la recuperación -- referencia "después"
      ],
      gracefulRampDown: '5s',
    },
  },
  setupTimeout: '120s',
};

export function setup() {
  const empresa = ensureEmpresa();
  const fixture = ensureLiveFixture(empresa);
  const buyers = [];
  for (let i = 1; i <= NUM_BUYERS; i++) {
    buyers.push(ensureBuyer(i));
  }
  return { buyers, remateId: fixture.remateId, loteId: fixture.loteId };
}

export default function (data) {
  const buyer = data.buyers[(__VU - 1) % data.buyers.length];
  const headers = { Authorization: `Bearer ${buyer.accessToken}` };

  const listRes = http.get(`${API_BASE_URL}/remates?status=live&page_size=10`, {
    headers,
    tags: { name: 'list_remates' },
  });
  check(listRes, { 'listado remates: 200': (r) => r.status === 200 });

  const detailRes = http.get(`${API_BASE_URL}/remates/${data.remateId}`, {
    headers,
    tags: { name: 'remate_detail' },
  });
  check(detailRes, { 'detalle remate: 200': (r) => r.status === 200 });

  const leadingRes = http.get(
    `${API_BASE_URL}/remates/${data.remateId}/lotes/${data.loteId}/ofertas/leading`,
    { headers, tags: { name: 'leading_offer' } }
  );
  check(leadingRes, { 'oferta vigente: 200': (r) => r.status === 200 });

  think(0.5, 1.5);
}
