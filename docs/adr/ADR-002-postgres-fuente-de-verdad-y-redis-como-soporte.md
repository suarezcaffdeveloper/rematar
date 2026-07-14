# ADR-002: PostgreSQL como fuente de verdad, Redis como soporte

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

El sistema necesita, al mismo tiempo: (a) consistencia fuerte para decidir quién ganó una
oferta, y (b) difusión de baja latencia de esa oferta a potencialmente miles de clientes
conectados a múltiples instancias de backend. Ninguna base de datos sola resuelve bien las
dos cosas al mismo tiempo con el mismo nivel de eficiencia.

## Decisión

**PostgreSQL es la única fuente de verdad de negocio.** Toda oferta se valida y confirma
ahí, con locking a nivel de fila (ver [ADR-004](ADR-004-concurrencia-en-determinacion-de-ganador.md)).
**Redis se usa exclusivamente como soporte**: Pub/Sub para difundir eventos ya confirmados
entre instancias de backend (backplane), cache de lectura para datos que no cambian a cada
instante, rate limiting de ofertas, y datos de presencia efímeros. Redis nunca decide por sí
solo si una oferta es ganadora.

## Alternativas consideradas

- **Redis como árbitro rápido de la oferta ganadora** (evaluado explícitamente con el
  usuario): usar operaciones atómicas o Lua scripts en Redis para resolver la oferta
  ganadora en memoria por velocidad, persistiendo a Postgres de forma asíncrona después.
  Más rápido en el camino feliz, pero introduce una segunda fuente de verdad: si Redis y
  Postgres divergen (por ejemplo, Redis pierde datos no persistidos ante un reinicio, o la
  escritura asíncrona a Postgres falla), queda ambigüedad real sobre quién ganó. Para el
  caso de uso central del producto (decidir un ganador de forma indiscutible), ese riesgo
  no vale la ganancia de latencia. Se descarta.
- **Solo Postgres, sin Redis** (usando `LISTEN/NOTIFY` para difusión): viable a baja
  escala, pero `LISTEN/NOTIFY` no está pensado para el volumen de fan-out de miles de
  conexiones ni ofrece rate limiting nativo eficiente. No cumple RNF-04.
- **Solo Redis, sin Postgres** (todo en Redis con persistencia AOF/RDB): pierde las
  garantías transaccionales multi-fila maduras que Postgres ofrece, necesarias para
  R-01/RNF-09.

## Consecuencias

- **Ventajas**: consistencia fuerte donde importa (resultado de una oferta), baja latencia
  donde importa (difusión en tiempo real), sin que ambas responsabilidades compitan entre sí.
- **Desventajas aceptadas**: cada oferta hace, como mínimo, una escritura transaccional en
  Postgres antes de poder difundirse — no es "todo en memoria", hay un piso de latencia
  real. Se acepta porque RNF-02 (150ms p95) es perfectamente alcanzable con una transacción
  bien indexada, y porque la alternativa (saltarse Postgres) compromete la corrección.
- Esta decisión es la base de por qué la caída de Redis (R-04, RNF-08) no corrompe datos de
  negocio: en el peor caso se pierde difusión en tiempo real temporalmente, nunca la verdad
  de quién ganó.
