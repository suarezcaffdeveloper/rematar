// Thresholds de k6 derivados de los objetivos de diseño ya documentados en
// docs/04-requisitos-no-funcionales.md -- no son umbrales inventados para este
// módulo, son los mismos RNF que loadtest/ ya usa en su motor de recomendaciones
// (loadtest/loadtest/report.py:build_recommendations). Mantenerlos en un solo lugar
// para que un escenario nuevo los importe en vez de reinventar el número.

// RNF-02: validación/aceptación de una oferta en menos de 150ms p95, sin contar red
// del cliente. Los escenarios de k6 son HTTP-only (el bidding real vive en loadtest/,
// ver k6/README.md) -- este valor queda acá documentado por si algún escenario de k6
// llega a tocar ese endpoint de lectura relacionado (ej. GET .../ofertas/leading).
export const RNF02_BID_P95_MS = 150;

// RNF-01: difusión de una oferta aceptada a todos los clientes de la sala en menos de
// 300ms p95 -- no aplica a k6 (es WebSocket puro, vive en loadtest/), documentado acá
// solo como referencia cruzada.
export const RNF01_BROADCAST_P95_MS = 300;

// Umbral genérico para los endpoints de solo lectura que sí cubre k6 (listado/detalle
// de remates y lotes, login) -- no hay un RNF explícito para estos en docs/04, así que
// se usa un valor conservador acorde a RNF-03 ("las lecturas no deben competir por los
// mismos locks que el bidding"): deberían responder rápido incluso bajo carga.
export const DEFAULT_HTTP_P95_MS = 500;

// Tasa de error tolerada antes de marcar el threshold como fallido -- mismo criterio
// que la recomendación de loadtest/ ("tasa de error > 2% revisar rate limiting/pool").
export const MAX_ERROR_RATE = 0.02;
