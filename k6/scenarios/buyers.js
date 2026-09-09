// Escenario B — Compradores (Fase 5). Sesión autenticada: login -> consulta remates
// -> entra a uno -> consulta lotes -> consulta detalle -> mira quién va ganando ->
// ocasionalmente oferta. La oferta va por HTTP puro (`POST .../ofertas` es un
// endpoint REST, no WebSocket -- ver docs/17-auction-engine.md), así que k6 la cubre
// sin problema; lo que k6 NO cubre es la conexión WebSocket para *recibir* el
// broadcast en tiempo real de esa oferta (eso sigue siendo `loadtest/`, ver
// k6/README.md).
//
// Este NO es el test de concurrencia de pujas (eso es la Fase 6 / `loadtest bid_storm`,
// que satura un único lote a propósito). Acá cada VU representa un comprador con un
// comportamiento normal -- ofertar es una probabilidad baja por iteración, no una
// carrera. Que dos compradores distintos choquen ocasionalmente sobre el mismo lote
// compartido es realista y esperado, no el objetivo de la medición.
//
// Uso:
//   k6 run k6/scenarios/buyers.js
//   k6 run -e NUM_BUYERS=100 --vus 100 --duration 2m k6/scenarios/buyers.js

import http from 'k6/http';
import { check } from 'k6';
import { API_BASE_URL } from '../lib/config.js';
import { ensureBuyer, ensureEmpresa } from '../lib/identity.js';
import { ensureLiveFixture } from '../lib/fixtures.js';
import { DEFAULT_HTTP_P95_MS, RNF02_BID_P95_MS, MAX_ERROR_RATE } from '../lib/thresholds.js';
import { pickRandom, think } from '../lib/util.js';

const NUM_BUYERS = Number(__ENV.NUM_BUYERS || 20);
const BID_PROBABILITY = Number(__ENV.BID_PROBABILITY || 0.3);

export const options = {
  scenarios: {
    buyers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.min(NUM_BUYERS, 20) },
        { duration: '1m', target: Math.min(NUM_BUYERS, 20) },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${DEFAULT_HTTP_P95_MS}`],
    'http_req_duration{name:place_bid}': [`p(95)<${RNF02_BID_P95_MS}`],
    http_req_failed: [`rate<${MAX_ERROR_RATE}`],
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
  think();

  const detailRes = http.get(`${API_BASE_URL}/remates/${data.remateId}`, {
    headers,
    tags: { name: 'remate_detail' },
  });
  check(detailRes, { 'detalle remate: 200': (r) => r.status === 200 });
  think();

  const lotesRes = http.get(`${API_BASE_URL}/remates/${data.remateId}/lotes?page_size=10`, {
    headers,
    tags: { name: 'list_lotes' },
  });
  check(lotesRes, { 'listado lotes: 200': (r) => r.status === 200 });
  think();

  const loteDetailRes = http.get(
    `${API_BASE_URL}/remates/${data.remateId}/lotes/${data.loteId}`,
    { headers, tags: { name: 'lote_detail' } }
  );
  check(loteDetailRes, { 'detalle lote: 200': (r) => r.status === 200 });
  const lote = loteDetailRes.json();
  think(0.5, 1.5);

  const leadingRes = http.get(
    `${API_BASE_URL}/remates/${data.remateId}/lotes/${data.loteId}/ofertas/leading`,
    { headers, tags: { name: 'leading_offer' } }
  );
  check(leadingRes, { 'oferta vigente: 200': (r) => r.status === 200 });
  const leadingAmount = leadingRes.json('amount');

  if (Math.random() < BID_PROBABILITY && lote) {
    const base = leadingAmount !== null ? Number(leadingAmount) : Number(lote.base_price);
    const increment = Number(lote.min_increment) * (1 + Math.floor(Math.random() * 3));
    const amount = (base + increment).toFixed(2);
    const clientToken = `k6-${__VU}-${__ITER}-${Date.now()}`;

    const bidRes = http.post(
      `${API_BASE_URL}/remates/${data.remateId}/lotes/${data.loteId}/ofertas`,
      JSON.stringify({ amount, client_token: clientToken }),
      { headers: { ...headers, 'Content-Type': 'application/json' }, tags: { name: 'place_bid' } }
    );
    // Siempre 201 -- el resultado (aceptada/rechazada) va en el cuerpo, no en el
    // código HTTP (ver docs/17-auction-engine.md). Un rechazo de negocio (otro
    // comprador ganó la carrera, o el monto ya quedó desactualizado) es esperado
    // bajo carga compartida, no un error de la plataforma.
    check(bidRes, { 'ofertar: 201': (r) => r.status === 201 });
  }
}
