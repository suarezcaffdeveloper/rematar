# ADR-031: Integración WebSocket en la Sala del Remate — cliente genérico de transporte, snapshot por WS como reconciliador, anonimato re-aplicado en eventos crudos

- **Fecha**: 2026-07-26
- **Estado**: Aceptada

## Contexto

Épica 4, Módulo 4.6 pide conectar la Sala del Remate (Módulo 4.5, ADR-030) al Gateway
WebSocket que el backend ya tiene completo desde la Épica 3 — Snapshot como estado
inicial, eventos de dominio para mantenerla actualizada, sin polling ni recargas. ADR-030
ya había decidido explícitamente NO dejar código a medio construir para esto ("la
preparación es de contrato de props, no código simulado") — este módulo es exactamente
el trabajo que esa decisión anticipaba, sin que ninguna decisión de ADR-030 necesite
revisarse.

Tres restricciones explícitas de esta fase: cero cambios en `backend/` (Gateway WebSocket,
Snapshot Service, Event Bus, RoomManager, Auction Engine), cero cambios en la
autenticación, y cero cambios en la arquitectura existente del frontend. Cuatro
decisiones de diseño quedaron por tomar: dónde vive el cliente WebSocket y qué tan
genérico debe ser, cómo se obtiene y reconcilia el estado inicial, cómo se aplican los
eventos sin recargar la pantalla, y qué hacer con dos casos donde el protocolo del
backend no es exactamente lo que se hubiera esperado.

## Decisión

### A. `shared/websocket/client.ts` — un cliente de TRANSPORTE, sin conocer ningún dominio

`WebSocketClient` vive en `shared/`, no en `features/sala/`, y solo implementa el
protocolo del Gateway (auth en el primer mensaje, heartbeat, reconexión, salas, cierre) —
nunca interpreta `domain_event` ni `snapshot`. Mismo criterio que ya separa
`shared/api/client.ts` (transporte HTTP genérico) de `features/*/api.ts` (llamadas
específicas de cada dominio): un futuro Chat/Presencia/Notificaciones/Streaming
construye su propia interpretación de mensajes sobre el mismo `onMessage`/`send`
genéricos, sin que este archivo necesite una sola línea nueva. La alternativa evaluada
(un cliente ya acoplado a "remate", viviendo en `features/sala/`) se descarta por la
misma razón que ADR-030 ya usó para justificar `features/sala/` como feature propio: la
sala va a seguir creciendo, y mezclar "cómo hablar con el Gateway" con "qué significa un
evento de remate" en el mismo archivo haría más caro agregar la próxima feature en
tiempo real.

### B. El snapshot llega dos veces (HTTP + WebSocket) — la segunda reconcilia, no reemplaza a la primera

`useLiveRemateState` sigue llamando a `useRemateSnapshot` (HTTP, Módulo 4.5, sin
cambios) para pintar la pantalla de inmediato, sin esperar el handshake del WebSocket
(abrir conexión + autenticar + `join_room` + que el backend arme el snapshot es más
lento que un único `GET`). Apenas la conexión entra a la sala, el Gateway empuja un
segundo snapshot (mismo `RemateStateSnapshot`, `app/snapshot/messages.py::SnapshotMessage`,
integrado en el Módulo 3.6 — ver `docs/23-snapshot-service.md`) que **reemplaza por
completo** el estado en memoria. Esto pasa en la primera conexión (redundante pero
inofensivo, un re-render de más) y en cada reconexión (donde SÍ es necesario: resuelve
solo cualquier evento perdido durante la caída, sin que el frontend tenga que
implementar su propio mecanismo de "qué me perdí" — ese problema ya lo resuelve
RF-16/ADR-008 del lado del backend). Se descartó construir una reconciliación manual
(por ejemplo, llamar `reload()` de `useRemateSnapshot` cada vez que el WebSocket
reconecta) porque el backend ya entrega exactamente ese dato, gratis, como parte del
protocolo de `join_room` — duplicarlo del lado del cliente sería reinventar algo que ya
existe.

### C. Cada evento aplica un cambio incremental sobre el mismo objeto en memoria, nunca reconstruye todo

`features/sala/realtime/reducer.ts` expone dos funciones puras,
`applyDomainEventToSnapshot`/`applyDomainEventToLotes`, con un `switch` sobre
`event_type` — devuelven un objeto nuevo que comparte referencia con toda parte que el
evento no tocó (por ejemplo, `remate.paused` solo reconstruye `snapshot.remate`, nunca
`active_lote`/`recent_offers`). Esto es lo que hace que `React.memo` en
`OfferHistoryEntry`/`UpcomingLoteCard` (ya aplicado en el Módulo 4.5, pensado
exactamente para este momento) evite re-renderizar filas que no cambiaron — "evitar
recargar toda la pantalla" (pedido explícito de la épica) se cumple a nivel de
estructura de datos, no solo de UI.

`lote.opened` es el único caso que necesita una fuente de datos adicional: el evento
trae solo `lote_id`/`lot_number`/`display_order` (`app/modules/remates/lotes/events.py`,
sin cambios), no el lote completo. `useLiveRemateState` ya mantiene en memoria la lista
de `useLotes` (reusada tal cual de `features/remates/`, sin cambios) para la tira de
"próximos lotes" — se buscó ahí el lote completo en vez de pedir uno nuevo por HTTP o
esperar al próximo snapshot. Alternativa descartada: hacer un `GET /remates/{id}/lotes/{lote_id}`
puntual ante cada `lote.opened` — no existe ese endpoint hoy (agregarlo violaría "cero
cambios en el backend"), y además sería un pedido HTTP por cada apertura de lote,
exactamente el patrón de red que WebSockets vino a evitar.

### D. `oferta.placed`/`oferta.rejected` no mutan el snapshot — y por qué

- `oferta.placed` se publica ante cualquier intento (aceptado o no) — mutar el snapshot
  acá mostraría un estado transitorio que `oferta.accepted`/`oferta.rejected` corrige un
  instante después, sin aportar nada al usuario (parpadeo, no información).
- `oferta.rejected` se descarta por un motivo distinto y más importante: a diferencia
  del Snapshot Service (que enmascara `buyer_id` vía `SnapshotService._mask_oferta`), el
  Event Dispatcher del backend reenvía el evento crudo **sin enmascarar** `buyer_id` a
  toda la sala (`app/realtime/dispatcher.py`, sin cambios — verificado leyendo el código
  fuente, no asumido). `docs/06-eventos-del-sistema.md` ("notas de diseño") ya advertía
  explícitamente que un rechazo nunca debía difundirse a otros clientes ("de lo
  contrario cualquier conectado vería los intentos fallidos ajenos"). En este módulo,
  además, `PlaceBidButton` sigue deshabilitado (el formulario real de ofertar es un
  módulo futuro) — ningún usuario de esta pantalla puede ser el autor de una oferta
  rechazada, así que no hay ningún caso legítimo en el que mostrarlo. Se descarta el
  evento en el reducer en vez de renderizarlo con el `buyer_id` que trae. El día que
  exista el formulario real, ese módulo puede comparar `buyer_id` contra el usuario
  autenticado y mostrar el rechazo solo a su propio emisor — sin tocar el servicio
  WebSocket ni la forma general de este reducer.

### E. Anonimato de compradores, re-aplicado del lado del cliente para eventos en vivo

`oferta.accepted`/`oferta.winner_changed` sí actualizan la interfaz. Como el evento
crudo trae `buyer_id` real (mismo motivo que la sección D), `reducer.ts` fuerza
`buyer_id: null` de forma incondicional al construir cualquier `OfertaSnapshotEntry`
nueva — nunca vuelca el valor real a la interfaz. Es la misma política de anonimato
entre postores que ya aplicaba el Snapshot Service (`docs/27-sala-del-remate.md`,
"Anonimato de compradores"; `LeadingOfferRead` desde el Auction Engine, Épica 2.4):
la sala nunca debió mostrar una identidad de comprador, y el hecho de que el transporte
en tiempo real no la enmascare no es motivo para relajar esa política del lado del
cliente — es, en los hechos, el único punto donde el frontend tiene que hacer un trabajo
que el backend ya hace en otro lado.

### F. Reconexión con backoff exponencial, valores espejo del `EventConsumer` del backend

`WebSocketClient` reintenta con `delay = min(baseDelayMs * 2^intentos, maxDelayMs)`,
default 1s → 30s — los mismos valores que ya usa `REALTIME_CONSUMER_RETRY_BASE_SECONDS`/
`_MAX_SECONDS` del `EventConsumer` (`docs/22-sincronizacion-tiempo-real.md`, Módulo
3.5), no por casualidad: es el mismo problema (reconectar a una dependencia externa sin
saturarla) resuelto con el mismo criterio en las dos puntas de la misma arquitectura. El
contador de intentos se resetea a 0 apenas la conexión vuelve a autenticarse — mismo
criterio que `EventConsumer._run`. El JWT se relee en cada intento (`getToken()`
inyectado, nunca capturado) para que un refresh de sesión concurrente (ya resuelto por
el interceptor de `shared/api/client.ts`) se recoja solo, sin coordinación adicional.

## Alternativas consideradas

- **Cliente WebSocket específico de la sala, sin capa genérica separada**: más simple al
  principio, pero mezclaría protocolo de transporte con semántica de dominio en el mismo
  archivo — descartado por la sección A.
- **Reemplazar `useRemateSnapshot` (HTTP) por el snapshot que llega por WebSocket,
  eliminando la carga HTTP inicial**: se evaluó, pero obligaría a esperar todo el
  handshake (abrir conexión + auth + join_room + build del snapshot) antes de pintar
  cualquier cosa — peor experiencia percibida que el patrón actual (pintado inmediato
  con HTTP, reconciliado apenas el WebSocket confirma). Se descarta a favor de la
  sección B.
- **`reload()` manual de `useRemateSnapshot` en cada reconexión, en vez de usar el
  snapshot que ya empuja el Gateway**: reinventaría, del lado del cliente, un mecanismo
  de reconciliación que el backend ya resuelve como parte del protocolo de `join_room` —
  descartado por la sección B.
- **Mostrar `oferta.rejected` a toda la sala tal como llega**: descartado por la sección
  D — filtraría intentos fallidos ajenos, violando una política de diseño ya
  establecida desde la Fase 0 (`docs/06-eventos-del-sistema.md`).
- **Dejar `buyer_id` real en las entradas de historial construidas desde eventos en
  vivo** (ya que "total lo enmascara el backend en el snapshot, no hace falta acá"):
  descartado por la sección E — el backend NO lo enmascara en los eventos crudos,
  confirmado leyendo `app/realtime/dispatcher.py`; dejarlo sin enmascarar sería una
  regresión de privacidad real, no teórica.

## Consecuencias

- **Ventajas**: `shared/websocket/client.ts` es reutilizable de verdad (no solo
  declarado) para Chat/Presencia/Notificaciones/Streaming futuros, sin modificarlo; la
  reconexión resuelve sola cualquier evento perdido durante una caída, apoyándose en un
  mecanismo que el backend ya construyó (Módulo 3.6) en vez de duplicarlo; cada evento
  actualiza solo su parte de la pantalla, con `React.memo` ya aprovechando esa
  granularidad desde el Módulo 4.5; la política de anonimato de compradores se mantiene
  intacta también en tiempo real, pese a que el transporte crudo no la garantiza.
- **Desventajas aceptadas**: `connected_users` no se actualiza evento a evento (el
  backend todavía no publica presencia en tiempo real, ver `docs/20`/`docs/21`, "Qué NO
  se implementa") — se actualiza en cada reconexión (nuevo snapshot), no en vivo mientras
  la conexión sigue abierta; hay una ventana breve entre el snapshot HTTP inicial y el
  snapshot por WebSocket en la que, en el peor caso, un evento se aplica dos veces (un
  re-render redundante, nunca un dato faltante, mismo argumento que ya documentó
  `docs/23-snapshot-service.md`); `oferta.rejected` no tiene ningún efecto visible en
  este módulo (aceptado: no hay ningún usuario que pueda ser su emisor todavía, ver
  sección D).
- El día que exista el formulario real de "Realizar oferta", ese módulo extiende el
  manejo de `oferta.rejected` (comparar `buyer_id` contra el usuario autenticado) sin
  reabrir ninguna decisión de este ADR. El día que se implemente Chat/Presencia/
  Notificaciones/Streaming, cada uno construye su propia interpretación de mensajes
  sobre `shared/websocket/client.ts` sin modificarlo — ver sección A.
