# ADR-008: Reconexión mediante snapshot completo, no replay de eventos

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

Las conexiones WebSocket se cortan (redes móviles, wifi inestable, reinicio de una
instancia de backend — R-13). Cuando un cliente se reconecta, necesita terminar con el
mismo estado que si nunca se hubiera desconectado: qué lote está abierto, cuál es la
oferta vigente, cuánto tiempo queda. Redis Pub/Sub, la pieza elegida para difusión en
tiempo real ([ADR-002](ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md)), no
persiste mensajes: si el cliente no estaba conectado en el instante del publish, ese
mensaje se pierde para siempre (R-04).

## Decisión

Al conectarse o reconectarse a un remate, el cliente recibe primero un **snapshot completo
del estado actual** (lote abierto, oferta vigente, tiempo restante si aplica) leído
directamente de PostgreSQL — no un intento de reproducir la secuencia exacta de eventos
que se perdió. A partir de ese snapshot, el cliente vuelve a suscribirse al flujo de
eventos en tiempo real para las novedades que ocurran de ahí en adelante.

## Alternativas consideradas

- **Replay completo de eventos perdidos** (guardar un log de eventos, ej. en Redis Streams,
  y reproducir desde el último visto por el cliente): daría al cliente la secuencia exacta
  de lo que se perdió, pero para el caso de uso real (saber el estado *actual* del lote) es
  trabajo adicional que no cambia el resultado: al cliente no le importa la secuencia
  histórica de ofertas que se perdió mientras estuvo desconectado, le importa el estado
  vigente ahora. Se descarta como mecanismo de reconexión (aunque el log de ofertas en
  Postgres para auditoría, RF-25, sigue existiendo igual).
- **No hacer nada especial, dejar que el cliente reciba solo eventos nuevos**: el cliente
  reconectado quedaría con estado desactualizado hasta la próxima oferta, lo cual viola
  directamente RF-16 y RNF-07.

## Consecuencias

- **Ventajas**: mecanismo simple de razonar (una lectura consistente contra la fuente de
  verdad), no depende de mantener un log de eventos con retención y orden garantizado en
  Redis, resuelve exactamente lo que el cliente necesita (estado actual, no historia).
- **Desventajas aceptadas**: el cliente no se entera del detalle fino de qué pasó mientras
  estuvo desconectado (por ejemplo, cuántas ofertas intermedias hubo) — solo del resultado
  neto. Se acepta porque ese detalle no es necesario para participar correctamente del
  lote en curso; si se necesitara para auditoría, ya está en el historial de ofertas
  (RF-24/RF-25), consultable aparte.
- Esta decisión es la razón por la que R-03 y R-04 (pérdida de eventos en Pub/Sub) se
  consideran riesgos aceptados y no bugs a resolver: el diseño no depende de que Pub/Sub
  sea confiable, solo de que Postgres lo sea.
