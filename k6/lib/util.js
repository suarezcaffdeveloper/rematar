import { sleep } from 'k6';

// Tiempo de lectura simulado entre pasos de un flujo -- sin esto, un escenario
// termina siendo una ráfaga de requests pegados uno al otro, no "comportamiento
// realista" (ver la instrucción explícita del enunciado: "no hagas únicamente
// requests repetitivas al mismo endpoint"). Rango configurable por escenario.
export function think(minSeconds = 1, maxSeconds = 3) {
  sleep(minSeconds + Math.random() * (maxSeconds - minSeconds));
}

export function pickRandom(items) {
  if (!items || items.length === 0) {
    return null;
  }
  return items[Math.floor(Math.random() * items.length)];
}
