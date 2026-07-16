# ADR-026: Snapshot Service — reconstrucción de estado, reutilizable por transporte, sin duplicar reglas de dominio

- **Fecha**: 2026-07-21
- **Estado**: Aceptada

## Contexto

Desde el Módulo 3.5, un cliente conectado a una sala recibe eventos de dominio en
tiempo real — pero solo los que ocurren **después** de conectarse. Un cliente que entra
a mitad de un remate en vivo (RF-16) no tiene forma de saber el estado actual: qué lote
está abierto, cuál es la oferta ganadora, cuántos otros compradores están mirando. Hace
falta un servicio que reconstruya ese estado completo en el momento de la conexión —
reutilizable, porque el mismo problema lo va a tener cualquier cliente nuevo (HTTP, una
apertura de página, una futura app móvil), no solo el Gateway WebSocket.

[ADR-008](ADR-008-snapshot-mas-delta-para-reconexion.md) (Fase 0) ya había decidido
**qué** hacer ante una reconexión — snapshot completo leído de PostgreSQL, no un intento
de reproducir el stream exacto de eventos perdidos (Redis Pub/Sub no persiste mensajes,
R-04). Este módulo es la primera vez que esa decisión se **implementa**: qué campos
exactos lleva ese snapshot, de dónde sale cada uno, y cómo se integra con todo lo que
las fases intermedias (Módulos 3.1 a 3.5) construyeron después de que ADR-008 se
escribiera.

La épica llega con restricciones explícitas de estabilidad: no modificar el dominio, el
Auction Engine, el Event Bus, Redis, el Gateway WebSocket, el Room Manager ni el Event
Consumer — el nuevo servicio tiene que apoyarse en lo que esos módulos *ya* exponen.

## Decisión

### A. `app/snapshot/` — núcleo reutilizable, sin conocer el Gateway ni el Event Consumer

`SnapshotService.build(remate_id, viewer, *, connected_users=0)` es el único método
público. No recibe un `RoomManager` ni un `ConnectionManager`: recibe `connected_users`
como un `int` simple. Quien sí sabe de dónde sale ese número es cada transporte —
`app/websocket/router.py` lo calcula con `room_manager.connection_count(remate_id)`,
`app/snapshot/router.py` (HTTP) lo calcula leyendo `request.app.state.room_manager`
directamente — el servicio en sí nunca importa `app.websocket` (salvo la única
excepción documentada en la sección E). Esto es lo que permite que el mismo servicio
sirva HTTP, WebSocket y cualquier transporte futuro sin que ninguno de los tres necesite
saber cómo lo usan los otros dos. Verificado estáticamente en
`tests/test_architecture_boundaries.py::test_snapshot_service_core_never_imports_gateway_or_realtime`.

### B. Consulta propia y optimizada para "el lote activo", en vez de reusar `list_all_by_remate`

`LoteRepository` (sin modificar) no tenía un método que devolviera el lote `OPEN` de un
remate — solo `has_open_lote` (booleano) y `list_all_by_remate` (todos, sin filtrar).
`SnapshotService._get_open_lote` hace su propio `SELECT ... WHERE remate_id = ? AND
status = 'open' AND deleted_at IS NULL LIMIT 1`, apoyado en el mismo índice único
parcial que ya garantiza que ese resultado es, a lo sumo, una fila (ADR-017). Se
descarta explícitamente traer todos los lotes del remate y filtrar en Python — sería
`O(n)` en lotes por remate para un dato que el índice ya resuelve en `O(1)`. Si no hay
lote abierto, ninguna consulta de oferta líder ni de historial se ejecuta — se corta ahí
(otra optimización: nunca se pregunta por ofertas de un lote que no existe).

### C. `RemateService.get_visible_or_raise` decide la visibilidad; `OfertaRepository.list_by_lote` se usa directo, sin pasar por `AuctionEngine.list_history`

Para el remate, se reutiliza la misma regla de visibilidad que ya aplica
`GET /remates/{id}` — un snapshot nunca expone más de lo que ese endpoint ya expondría.
Para el historial de ofertas, **no** se reutiliza `AuctionEngine.list_history`: ese
método está restringido a dueño/administrador (`ForbiddenError` para cualquier otro
viewer), pensado para una auditoría completa — un snapshot para un comprador viendo el
remate en vivo necesita ver ofertas recientes igual que ya puede ver la oferta líder vía
`GET .../ofertas/leading` (`LeadingOfferRead`, sin restricción de rol). Se llama
`OfertaRepository.list_by_lote` directamente, con el mismo criterio de visibilidad ya
usado para la oferta líder — más abajo, sección D, para cómo se protege la identidad del
ofertante en ese caso.

### D. Enmascarado de `reserve_price`/`buyer_id`: regla propia, no una llamada a un método privado de otro módulo

`RemateStateSnapshot.active_lote.reserve_price` y `winning_offer`/`recent_offers[].buyer_id`
se ocultan (`None`) para cualquier viewer que no sea el dueño del remate ni un
administrador — mismo criterio exacto que ya aplica `LoteService._mask_reserve_price`
(reserve_price) y que ya insinuaba `LeadingOfferRead` (buyer_id, para la oferta líder;
acá se generaliza también al historial reciente). No se llama al método privado
`LoteService._mask_reserve_price` — se reimplementa la misma condición de una línea
(`viewer.role == ADMIN or viewer.id == remate.owner_id`) como un helper propio de
`SnapshotService`, para no cruzar el límite de módulo hacia un método marcado como
privado de otra clase. Es una duplicación deliberada de una regla estable y de una sola
línea, no una reimplementación de lógica de negocio compleja — documentada acá
explícitamente para que quede claro que si ADR-016 cambia esa regla, este archivo
también hay que tocarlo.

### E. `messages.py` es la única excepción a "no importa el Gateway" — mismo patrón que ADR-025

`app/snapshot/messages.py` define `SnapshotMessage(WSMessage)`, importando `WSMessage`
de `app/websocket/messages.py` **sin modificarlo** — idéntico patrón a
`DomainEventMessage` (Módulo 3.5, ADR-025 sección E). Es el único archivo del paquete
que sabe que existe un protocolo de Gateway; el resto de `app/snapshot/` no lo sabe.

### F. Inyección de dependencias propia para Redis/EventBus — `HTTPConnection`, no `Request`

Al integrar `SnapshotService` en el Gateway apareció un problema real, no anticipado:
`app.redis.dependencies.get_cache` depende de `get_redis_client(request: Request)`
(Módulo 3.1), y `app.modules.remates.dependencies.get_remate_service` depende, a través
de `get_event_bus` -> `get_pubsub`, del mismo `get_redis_client`. `Request` es un tipo
que FastAPI solo sabe inyectar en rutas HTTP — usar cualquiera de esas dos dependencias
tal cual en el Gateway WebSocket falla en tiempo de resolución
(`TypeError: get_redis_client() missing 1 required positional argument: 'request'`),
porque una ruta `@router.websocket(...)` no tiene un `Request`, tiene un `WebSocket`.

La solución, sin modificar `app/redis/` ni `app/modules/remates/`: `HTTPConnection`
(`starlette.requests`) es la clase base común de `Request` y `WebSocket`, y FastAPI sí
sabe inyectarla en ambos casos. `app/snapshot/dependencies.py` define `_get_cache` y
`_get_event_bus` tomando un `HTTPConnection` y construyendo, a mano, el mismo
`RedisCache`/`RedisEventBus` que las dependencias HTTP-only ya arman internamente
(`connection.app.state.redis`) — y `_get_remate_service` construye su propio
`RemateService` con esas piezas, en vez de depender de
`app.modules.remates.dependencies.get_remate_service`. `get_visible_or_raise` (lo único
que se usa) nunca publica eventos, pero se le da un `EventBus` completamente funcional
igual, no uno "no-op" — para que la instancia quede utilizable por cualquier método
futuro sin sorpresas silenciosas.

### G. `RedisCache.set` solo acepta TTL en segundos enteros — se envuelve en `timedelta`

`RedisCache.set(key, value, *, ttl)` (Módulo 3.1, sin modificar) solo convierte a
entero un `ttl: timedelta` — pasarle un `float` crudo lo manda tal cual al comando `EX`
de Redis, que lo rechaza (`ERR value is not an integer`). `SnapshotService` envuelve
`cache_ttl_seconds` en `timedelta(seconds=...)` antes de llamar a `set` — con la
consecuencia de que el TTL efectivo se trunca a segundos enteros (ver
`RedisCache`/`redis-py`, que hacen `int(timedelta.total_seconds())`). El default
(`SNAPSHOT_CACHE_TTL_SECONDS = 2.0`) ya es un valor entero a propósito.

### H. Cache: se cachea el estado crudo (sin enmascarar), nunca la respuesta final

`RawRemateState` (lote activo + oferta líder + historial, **sin** aplicar el
enmascarado de la sección D) es lo único que se guarda en Redis, con TTL corto
(`SNAPSHOT_CACHE_TTL_SECONDS`, default 2s) bajo la clave `snapshot:<remate_id>`. El
enmascarado se aplica **después** de leer de caché (o de la base), en cada llamada a
`build`, según el `viewer` de ese pedido puntual. Cachear la respuesta ya enmascarada
sería un riesgo de seguridad real: sires el primer pedido lo hace el dueño (ve
`reserve_price`) y el segundo un comprador cualquiera dentro del mismo TTL, cachear la
versión del dueño filtraría el precio de reserva al comprador. Separar "qué se cachea"
de "qué se enmascara" evita esa clase de bug de raíz. Fallas de Redis (lectura, escritura,
JSON corrupto) se atrapan y se degradan a consultar la base directamente — mismo
criterio best-effort que `RedisEventBus.publish` (ADR-022, sección D).

### I. Integración con el Gateway: solo al entrar a una sala, sin deshacer el `join_room` si el snapshot falla

`app/websocket/router.py` llama a `SnapshotService.build` únicamente dentro de
`_handle_join_room`, después de confirmar `room_joined` — el único punto que la épica
pidió explícitamente. Si el snapshot no se puede construir (remate no visible/no
existe — recordar que `RoomManager.join` no valida `remate_id` contra el dominio,
ADR-024 sección D), se manda un `ErrorMessage(code=snapshot_unavailable)` **sin**
cerrar la conexión ni sacar a la conexión de la sala — mismo criterio que los demás
errores de sala (ADR-024, sección F): es recuperable, no invalida una decisión ya tomada
por un módulo anterior. Reabrir esa decisión (hacer que `join_room` dependa de que el
remate exista) hubiera sido tocar `rooms.py`, fuera de alcance de este módulo.

## Alternativas consideradas

- **Reusar `get_remate_service`/`get_cache` tal cual**: se descarta — rompe el Gateway
  WebSocket en tiempo de resolución de dependencias (sección F). Es la alternativa que
  se probó primero y falló en la práctica antes de encontrar `HTTPConnection`.
- **Pasar el `RoomManager` completo a `SnapshotService.build`** en vez de un `int` ya
  calculado: más cómodo para el único llamador de hoy (el Gateway), pero acopla el
  servicio a un tipo que vive en `app/websocket/` — exactamente lo que la épica pidió
  evitar ("no dependerá del Gateway"). Se prefiere el `int`, calculado por cada
  transporte a su manera.
- **Reusar `AuctionEngine.list_history` para el historial reciente**: se descarta —
  ese método es deliberadamente dueño/admin-only (auditoría completa); un snapshot para
  cualquier comprador visible necesita el mismo nivel de acceso que ya tiene
  `GET .../ofertas/leading`, no el de un endpoint de auditoría.
- **Cachear la respuesta final ya enmascarada**, con una clave por `(remate_id, viewer)`:
  evita tener que enmascarar en cada llamada, pero multiplica las entradas de caché por
  cantidad de viewers distintos (mala tasa de aciertos para un remate con muchos
  compradores) y sigue siendo más frágil que separar "qué se cachea" de "qué se
  enmascara" (sección H). Se descarta.
- **Bloquear el `join_room` hasta que el snapshot esté listo, fusionando ambos
  mensajes en una sola confirmación**: simplifica el protocolo (un mensaje menos) pero
  acopla la confirmación de la sala (mecánica de `RoomManager`, instantánea) al tiempo
  de una consulta a la base (variable) — y le quita al cliente la posibilidad de saber
  que ya está en la sala mientras espera el snapshot. Se prefieren dos mensajes
  separados, secuenciales.

## Consecuencias

- **Ventajas**: cero cambios en dominio, Auction Engine, Event Bus, Redis, Gateway,
  Room Manager y Event Consumer — verificado por la suite existente (sigue pasando sin
  modificaciones) y por tests de límites de import nuevos; el mismo servicio ya se
  prueba y se usa desde HTTP y WebSocket (`test_snapshot_http.py`,
  sección "Snapshot" de `test_websocket_gateway.py`); la consulta del lote activo es
  `O(1)` vía índice, no `O(n)` en lotes del remate; la caché corta absorbe ráfagas de
  reconexión a un remate popular sin cachear un dato sensible por accidente.
- **Desventajas aceptadas**: `SnapshotService` reimplementa (no reutiliza) la condición
  de un único booleano que otros dos módulos ya calculan — una duplicación pequeña y
  documentada, aceptada porque la alternativa (exponer ese booleano como una función
  pública reutilizable) implicaría modificar `LoteService`, fuera de alcance; el TTL de
  caché efectivo está limitado a segundos enteros por una limitación ya existente de
  `RedisCache`, no una elegida por este módulo — un TTL sub-segundo no es alcanzable sin
  tocar `app/redis/cache.py`.
- Cuando Chat, Notificaciones o Presencia Online se implementen, cada uno puede pedir su
  propio snapshot inicial (o extender `RemateStateSnapshot`) sin que el Auction Engine
  se entere — mismo patrón de desacoplamiento que ya dejó ADR-025.
