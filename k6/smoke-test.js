// Verificación rápida (1 VU, 1 iteración) de que la estrategia de datos de prueba
// (Fase 4) funciona de punta a punta contra el stack local: registra/loguea la
// empresa + un martillero + un comprador sintéticos, asegura el remate/lote fixture
// LIVE+OPEN, y asigna el martillero como operador. No es un escenario de carga --
// correr esto antes de cualquier escenario real (Fase 5+) para confirmar que el
// entorno responde y las identidades/fixtures están sembradas.
//
// Uso: k6 run k6/smoke-test.js  (desde la raíz del repo, o `k6 run smoke-test.js`
// desde dentro de k6/)

import { check } from 'k6';
import { ensureBuyer, ensureEmpresa, ensureRematador } from './lib/identity.js';
import { ensureLiveFixture, assignOperator } from './lib/fixtures.js';

export const options = { vus: 1, iterations: 1 };

export default function () {
  const empresa = ensureEmpresa();
  const rematador = ensureRematador();
  const buyer = ensureBuyer(1);

  check(empresa, { 'empresa tiene access_token': (e) => !!e.accessToken });
  check(rematador, { 'rematador tiene access_token': (r) => !!r.accessToken });
  check(buyer, { 'comprador tiene access_token': (b) => !!b.accessToken });

  const fixture = ensureLiveFixture(empresa);
  check(fixture, {
    'fixture tiene remateId': (f) => !!f.remateId,
    'fixture tiene loteId': (f) => !!f.loteId,
  });

  assignOperator(empresa, rematador, fixture.remateId);

  console.log(
    `OK -- empresa=${empresa.userId} rematador=${rematador.userId} buyer=${buyer.userId} ` +
      `remate=${fixture.remateId} lote=${fixture.loteId}`
  );
}
