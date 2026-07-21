# ADR-036: Sistema de Presencia — `PresenceService` compositor, sin modificar `RoomManager`/`ConnectionManager`

- **Fecha**: 2026-07-31
- **Estado**: Aceptada

## Contexto

Desde el Módulo 3.4, `docs/21-sistema-de-salas.md` documenta explícitamente qué falta
para presencia: "no hay presencia online (contadores visibles para otros usuarios,
notificaciones de entrada/salida)". `docs/22-sincronizacion-tiempo-real.md` (Módulo
3.5) fue más allá y **anticipó una implementación concreta**, en su sección "Cómo esta
arquitectura permitirá agregar Chat, Notificaciones y Presencia Online":

> "Presencia online: un contador de conectados por sala ya es trivial de calcular hoy
> (`RoomManager.connection_count(remate_id)`) — falta únicamente *anunciarlo*. Eso es un
> evento más (`presencia.usuario_conectado`, ya nombrado en
> [06-eventos-del-sistema.md](../06-eventos-del-sistema.md) desde Fase 0) publicado por
> el propio `RoomManager.join`/`leave` — el único cambio necesario sería agregar un
> `event_bus.publish(...)` dentro de esos dos métodos (que ya son `async` a propósito,
> ver ADR-024, sección final) y sincronizarlo con el mismo `EventDispatcher` que ya
> existe."

`docs/20-gateway-websocket.md` (Módulo 3.3) había anticipado lo mismo para
`ConnectionManager.register`/`unregister`. Este módulo (Épica 6, Módulo 6.2) implementa
presencia en serio — y, al hacerlo, se aparta deliberadamente de la vía que esos dos
documentos habían sugerido. Este ADR registra por qué.

## Decisión

### A. `PresenceService` nuevo, en vez de inyectar `EventBus` a `RoomManager`/`ConnectionManager`

`app/presence/service.py::PresenceService` envuelve `RoomManager` y `ConnectionManager`
(ambos **sin modificar**) y agrega, por fuera, la publicación de eventos de presencia
sobre el `EventBus` ya existente. Mismo patrón arquitectónico que `SnapshotService`
(Módulo 3.6): un paquete nuevo que **compone** infraestructura ya construida, en vez de
extender su constructor.

### B. Por qué no se tocó `RoomManager`/`ConnectionManager` directamente, como sugerían docs/20 y docs/22

El sketch de `docs/22` proponía agregar el `event_bus.publish(...)` **dentro** de
`RoomManager.join`/`leave`. Al momento de implementar esto en la práctica, eso implica:

1. **Cambiar la firma del constructor** de `RoomManager` (y, para el caso simétrico de
   `ConnectionManager.register`/`unregister`, la de `ConnectionManager`) para recibir un
   `EventBus` — hoy ambos se instancian con **cero argumentos**, tanto en
   `app/main.py` (`RoomManager()`, `ConnectionManager()`) como en cada test unitario
   existente (`tests/test_room_manager.py`, más de una decena de instanciaciones
   directas).
2. **Violar el invariante explícito de ADR-023/ADR-024**: *"`RoomManager` no importa
   nada de `app/events/`"* (ADR-024, docstring de `rooms.py`) — ese invariante existe
   por una razón concreta, no es incidental: mantiene a `RoomManager` testeable en
   aislamiento total (dos `dict`, sin I/O) y sin conocer cómo se transportan los
   eventos que dispara.
3. **Acoplar una pieza "tonta" a una decisión de infraestructura** (Redis Pub/Sub) que
   hoy ni siquiera necesita conocer — `RoomManager`/`ConnectionManager` seguirían
   siendo reutilizables en un contexto sin Redis (por ejemplo, un test que no lo
   necesita) solo si mantienen su independencia actual.

`PresenceService` logra exactamente el mismo resultado observable (join/leave publican
su evento) sin ninguno de esos tres costos: `RoomManager`/`ConnectionManager` no
cambian una línea, ni su firma ni su comportamiento, y sus tests existentes siguen
pasando sin modificación.

### C. `join_room`/`leave_room` — mismo valor de retorno, cero cambio de contrato para el Gateway

`PresenceService.join_room(remate_id, connection_id, user_id) -> bool` y
`PresenceService.leave_room(connection_id, user_id) -> UUID | None` tienen exactamente
la misma forma de retorno que `RoomManager.join`/`leave` — el Gateway
(`app/websocket/router.py`) solo cambia **de quién** llama (`presence_service` en vez
de `room_manager`), no cómo interpreta la respuesta. `ERROR_ALREADY_IN_ROOM`/
`ERROR_NOT_IN_ROOM` (`app/websocket/rooms.py`, sin cambios) se siguen usando tal cual.

### D. Detección de membresía nueva antes de publicar — evita ruido en re-joins idempotentes

`RoomManager.join` es idempotente: pedir unirse a la sala en la que ya se está devuelve
`True` sin cambiar nada (ADR-024, sección B). Publicar presencia en ese caso sería
anunciar una conexión "nueva" que en realidad no cambió. `PresenceService.join_room`
resuelve esto comparando `room_manager.room_id_for_connection(connection_id)` **antes**
de llamar a `join()` — sin necesitar que `RoomManager` exponga ningún estado nuevo, ese
método ya existía desde el Módulo 3.4.

### E. Conteo derivado siempre de la misma lista (`connected_users_summary`)

`PresenceService` nunca calcula el conteo (`int`) por un lado y el detalle
(`list[ConnectedUserSummary]`) por otro — el conteo es `len(connected_users_summary(...))`.
Antes de este módulo, el Gateway (`_send_snapshot`) y el endpoint HTTP de snapshot
calculaban el conteo con `room_manager.connection_count(remate_id)`, una llamada
separada; ahora ambos piden el detalle completo y derivan el conteo de ahí, eliminando
la posibilidad (por mínima que fuera) de que ambos números discreparan.

### F. Los eventos de presencia llevan `connection_id`, no solo `user_id`

`PresenceUserConnected`/`PresenceUserDisconnected` (`app/presence/events.py`) incluyen
`connection_id: UUID` además de `user_id: UUID`. Es imprescindible: `RoomManager`
distingue conexión de usuario desde el Módulo 3.4 (dos pestañas del mismo usuario son
dos `connection_id` distintos en la misma sala, `docs/21-sistema-de-salas.md`, "Cómo se
administran varias conexiones del mismo usuario") — sin `connection_id`, el frontend no
podría reconciliar cuál de las dos conexiones de un mismo usuario se desconectó al
recibir `presencia.usuario_desconectado` (ver sección H).

### G. `ConnectedUserSummary` vive en `app/presence/schemas.py`, `app/snapshot/` lo importa

La dirección de dependencia es `app/snapshot/schemas.py -> app/presence/schemas.py`
(importa el tipo), nunca al revés — mismo criterio que ya usa `app/realtime/messages.py`
importando `WSMessage` desde `app.websocket.messages`. `SnapshotService.build` sigue sin
importar ningún *servicio* de transporte (`RoomManager`, `ConnectionManager`,
`PresenceService`): recibe `connected_users_detail` como una lista de datos simples, ya
calculada por quien lo invoca (Gateway o router HTTP), exactamente el mismo criterio que
ADR-026 sección C ya aplicaba a `connected_users: int`.

### H. Frontend: el reducer indexa por `connection_id`, nunca por `user_id`

`applyDomainEventToSnapshot` (`features/sala/realtime/reducer.ts`) hace upsert/remove en
`connected_users_detail` buscando por `connection_id`. Indexar por `user_id` habría roto
el caso de dos pestañas del mismo usuario: al cerrar una, un remove-por-`user_id` habría
eliminado también la entrada de la pestaña que sigue conectada.

### I. `connected_users_detail` enmascarado con el mismo mecanismo que `reserve_price`/`buyer_id`

`SnapshotService._mask_connected_users_detail` sigue el patrón ya establecido por
`_mask_lote`/`_mask_oferta` (ADR-026): `None` si el viewer no es dueño del remate ni
admin. El conteo (`connected_users: int`) no se enmascara — sigue siendo información
pública desde el Módulo 3.6.

### J. Sin nombre/email en `ConnectedUserSummary`

`PresenceService` no importa `app.modules.users` — solo conoce lo que
`ConnectionContext` (Módulo 3.3) ya expone: `user_id`, `connected_at`. Resolver un
nombre visible requeriría una consulta a la base desde una pieza que hoy es
enteramente en memoria (`RoomManager`/`ConnectionManager`) o desde el propio
`PresenceService`, acoplándolo a un módulo de dominio que hasta ahora ninguna pieza de
`app/websocket/`/`app/realtime/`/`app/presence/` necesitó conocer. Se documenta como
limitación deliberada, no como omisión — ver `docs/33-sistema-de-presencia.md`.

### K. `GET /presence/global`, sin un endpoint por-remate adicional

El conteo/detalle por remate ya viaja completo por el snapshot (HTTP y WebSocket) y se
mantiene en vivo por los eventos de presencia — un endpoint HTTP por-remate sería
redundante. El único dato que hoy no expone ningún endpoint es el agregado de **todo el
proceso** (`room_count()`+`connection_manager.count()`, ya expuestos como métodos desde
ADR-024 sección H, "sin un endpoint HTTP todavía") — `GET /presence/global` cierra
exactamente ese hueco, ni más ni menos.

## Alternativas consideradas

- **Publicar desde dentro de `RoomManager.join`/`leave` y `ConnectionManager.register`/
  `unregister`** (el sketch original de docs/20/docs/22): descartada por las razones de
  la sección B — rompe firmas y tests existentes, y acopla infraestructura "tonta" a
  Redis sin necesidad.
- **`ConnectedUserSummary` en `app/snapshot/schemas.py`** en vez de
  `app/presence/schemas.py`: se descartó porque el dato es propiedad conceptual de
  presencia (quién está conectado), no del snapshot -- el snapshot solo lo *incluye*.
  Definirlo en `presence` y que `snapshot` lo importe evita duplicar el shape y deja la
  dirección de dependencia apuntando hacia el paquete que efectivamente lo calcula.
- **Incluir nombre/email en `ConnectedUserSummary`** (vía join a `app.modules.users`):
  descartado por acoplamiento — ver sección J. Queda como extensión posible de un
  consumidor futuro (por ejemplo, un panel de administración), resuelto en su propia
  capa.
- **Endpoint HTTP de presencia por remate**: descartado por redundante — ver sección K.
- **Excluir al propio conectado de recibir su evento de presencia** (para no
  "auto-anunciarse"): descartado por simetría con el resto del pipeline —
  `OfertaAccepted`/`LoteOpened` etc. ya se entregan a **todos** los conectados de la
  sala, incluido quien originó la acción (`docs/22`, "el comprador que ofertó ya
  recibió su 200 OK... antes de que el evento siquiera llegue"). Excluir un caso
  particular habría requerido lógica condicional nueva en `EventDispatcher`
  (`app/realtime/dispatcher.py`), que hoy es completamente genérico sobre
  `EVENT_REGISTRY` — el costo de mantener esa generalidad supera el beneficio cosmético
  de no recibir el propio evento (el frontend ya recibe el número correcto por el
  snapshot directo, este evento solo lo reconfirma).

## Consecuencias

- **Ventajas**: `RoomManager`/`ConnectionManager`/`EventDispatcher`/`EventConsumer`
  quedan exactamente como estaban — probado por sus propios tests, sin modificación, y
  por `test_architecture_boundaries.py` (regla nueva: `app/presence/` no puede importar
  dominio ni `app.realtime`/`app.snapshot`). Agregar presencia fue, en los hechos, sumar
  dos clases de evento a un registry y un servicio compositor nuevo — ninguna
  reestructuración.
- **Desventajas aceptadas**: existe ahora un segundo lugar (`PresenceService`, además
  de `RoomManager`) que sabe "quién está en qué sala" — se acepta porque
  `PresenceService` no duplica el estado, solo lo consulta a través de los métodos
  públicos ya existentes (`connections_in_room`, `connection_count`) sin mantener su
  propia copia.
- El re-join idempotente sin publicación (sección D) implica que un cliente que llama
  `join_room` repetidamente sobre la misma sala no genera tráfico de presencia — igual
  de correcto tanto si es un reintento accidental del cliente como si es exactamente lo
  que se espera; no hace falta distinguir el motivo.
- Cualquier módulo futuro de Chat/Moderación/Seguimiento/Estadísticas puede sumarse al
  mismo punto de extensión (`app/realtime/registry.py` + un evento `RemateScopedEvent`
  nuevo) sin reabrir `PresenceService` ni ninguna pieza de este módulo — mismo argumento
  que ya demostró la Épica 3 completa.
