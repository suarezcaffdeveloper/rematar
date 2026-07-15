# ADR-024: Sistema de Salas — administrador en memoria, una sala por conexión, sin dependencias de dominio

- **Fecha**: 2026-07-19
- **Estado**: Aceptada

## Contexto

[ADR-023](ADR-023-gateway-websocket.md) (Módulo 3.3) ya dejó el Gateway WebSocket
administrando conexiones individuales, y explícitamente anticipó este módulo en su
sección "Consecuencias": agrupar conexiones por remate es "una estructura de datos
nueva, no una reescritura del Gateway". Ahora hace falta decidir el detalle de esa
estructura: cómo se representa una sala, qué invariante rige cuántas salas puede
integrar una misma conexión a la vez, cómo se comunica el cliente para unirse/salir, y
qué pasa con una sala cuando la última conexión se va — sin todavía conectar nada de
esto al Event Bus ([ADR-022](ADR-022-arquitectura-de-eventos.md)) ni al dominio.

## Decisión

### A. `RoomManager` — índice bidireccional en memoria, sin locking explícito

Mismo criterio que `ConnectionManager` (ADR-023, sección B): una única instancia por
proceso, creada en el `lifespan` de `app/main.py`, con dos `dict` en memoria que se
mantienen consistentes entre sí:

```python
class RoomManager:
    _rooms: dict[UUID, set[UUID]]        # remate_id -> {connection_id, ...}
    _connection_room: dict[UUID, UUID]   # connection_id -> remate_id
```

Sin locks: una instancia de backend corre en un único event loop, y las mutaciones de
`dict`/`set` entre puntos de `await` son atómicas en asyncio — la misma razón que ya
justificó la ausencia de locking en `ConnectionManager`.

### B. Invariante "una sala por conexión" — se rechaza el segundo `join`, no se auto-cambia

El enunciado de la épica es explícito: una conexión WebSocket está en, a lo sumo, una
sala de remate a la vez. `RoomManager.join(remate_id, connection_id)` devuelve `False`
sin efecto si la conexión ya está en una sala **distinta** — el cliente tiene que
mandar `leave_room` primero. Volver a pedir unirse a la sala en la que ya está es
idempotente (devuelve `True`, no hace nada nuevo). No hay auto-cambio de sala (salir de
la vieja y entrar a la nueva en un solo mensaje): un cliente que navega de un remate a
otro manda dos mensajes explícitos, no uno ambiguo.

### C. API por valor de retorno, no por excepción

`join` devuelve `bool` (se pudo unir o no); `leave` devuelve `UUID | None` (el
`remate_id` del que salió, o `None` si no estaba en ninguna sala). Un intento de unión
inválido o un `leave_room` sin sala activa son resultados esperados y frecuentes del
protocolo — no son bugs de programación, así que no ameritan una excepción. El
`router.py` traduce esos valores de retorno a un `ErrorMessage` (ver sección F) sin
tener que envolver cada llamada en `try/except`.

### D. Sin ninguna validación de dominio sobre `remate_id`

`remate_id` es, para este módulo, un UUID estructural — nada más. `RoomManager` no
verifica que exista un `Remate` con ese id, que esté `LIVE`, ni ningún otro invariante
de negocio. Es una decisión explícita de alcance de esta épica ("no modificar el
dominio del negocio") y además la misma disciplina de límites que ADR-023 ya aplicó:
`app/websocket/` no importa `app/modules/`. La consecuencia práctica es que hoy se
puede "crear" una sala para un UUID que no corresponde a ningún remate real — se acepta
porque validarlo requeriría exactamente la dependencia de dominio que este módulo evita
a propósito; queda como trabajo explícito del próximo módulo (integración con el Event
Bus) si en ese punto se decide que hace falta.

### E. Eliminación automática de salas vacías, integrada en `leave`

No hay un proceso de limpieza periódico ni un TTL: `leave()` borra la entrada de
`_rooms[remate_id]` en el mismo momento en que su `set` de conexiones queda vacío,
dentro de la misma llamada que sacó a la última conexión. Una sala existe si y solo si
tiene al menos una conexión — nunca hay que preguntarse si una sala "vacía" sigue viva
en el registro.

### F. Mensajes nuevos en `messages.py`, y primer uso real de `ErrorMessage`

`JoinRoomMessage` (`{"type": "join_room", "remate_id": "..."}`), `LeaveRoomMessage`
(`{"type": "leave_room"}`), `RoomJoinedMessage` y `RoomLeftMessage` como confirmación.
`ErrorMessage` — definido en el Módulo 3.3 pero sin ningún emisor todavía — se usa acá
por primera vez para reportar un `join_room`/`leave_room` inválido **sin cerrar la
conexión**: a diferencia de un fallo de autenticación (ADR-023, que sí cierra con un
código 4xxx porque la conexión entera es inválida), un intento de unión rechazado es
recuperable — el cliente sigue conectado y puede corregir el mensaje y reintentar.

### G. Ninguna sala se toca desde `manager.py` ni `auth.py`

Los únicos archivos existentes tocados son los que ADR-023 ya identificó como puntos de
extensión: `router.py` (agrega el `Depends(get_room_manager)`, el despacho de
`join_room`/`leave_room`, y una línea más en el `finally` que ya limpiaba
`ConnectionManager`), `messages.py` (los cuatro mensajes nuevos), `dependencies.py`
(`get_room_manager`) y `main.py` (crear el `RoomManager` en el `lifespan`). **Cero
cambios** en `manager.py` (`ConnectionContext` no gana un campo `room_id`) ni en
`auth.py` — exactamente lo que ADR-023 había previsto.

### H. Métricas expuestas como métodos, sin endpoint HTTP nuevo

`room_count()`, `connection_count(remate_id)`, `total_connections()` y `list_rooms()`
son métodos públicos de `RoomManager`, inyectables vía `Depends(get_room_manager)` —
sin un endpoint HTTP de monitoreo todavía, porque el enunciado de esta épica los pide
como capacidad ("el sistema deberá permitir obtener información"), no como feature de
producto. Construir el endpoint es trabajo trivial y diferido a cuando exista un
consumidor real (un dashboard de admin, por ejemplo).

## Alternativas consideradas

- **Auto-cambio de sala** (un `join_room` a una sala distinta saca automáticamente de
  la anterior): más cómodo para un cliente que solo quiere "estar mirando este
  remate ahora", pero oculta la transición en logs/tests y le quita al cliente la
  oportunidad de decidir explícitamente "quiero salir de la anterior primero" (por
  ejemplo, para no perderse el último evento de esa sala mientras migra). Se prefiere
  rechazar y dejar la intención explícita; relajarlo después es cambiar un `if` en
  `join()`, no un rediseño.
- **`room_id` como campo de `ConnectionContext`** (`manager.py`): ADR-023 ya lo había
  descartado preventivamente — acoplaría el registro genérico de conexiones a un
  concepto de dominio de salas. Un índice aparte en `RoomManager` alcanza.
- **Validar `remate_id` contra la tabla `remates` real**: descartado explícitamente por
  el alcance de esta épica y por la misma disciplina de límites de módulo que ya rige
  `app/websocket/` (ADR-023, sección D) — documentado como deuda intencional, no como
  omisión accidental.
- **Excepciones custom (`AlreadyInRoomError`, `NotInRoomError`)** en vez de valores de
  retorno: se descarta a favor de retorno explícito — un join rechazado o un leave sin
  sala activa son resultados del protocolo, no errores de programación; usar
  excepciones para control de flujo esperado obliga a `try/except` en cada call site
  sin ganar nada a cambio.
- **Un solo `dict[UUID, set[UUID]]`** (`remate_id -> conexiones`), sin el índice
  inverso `connection_id -> remate_id`: más simple a primera vista, pero determinar "¿en
  qué sala está esta conexión?" (necesario en cada `leave` y para rechazar un segundo
  `join`) requeriría recorrer todas las salas — el índice inverso hace esas operaciones
  `O(1)` a cambio de mantener dos estructuras sincronizadas, que es exactamente lo que
  `join`/`leave` ya hacen en un único lugar cada una.

## Consecuencias

- **Ventajas**: `RoomManager` es trivial de testear en aislamiento (dos `dict`, sin
  I/O); ninguna sala fantasma queda en el registro porque la eliminación es parte de la
  misma operación que la vacía; el Gateway sigue sin conocer `Remate` como entidad de
  dominio; `router.py` solo gana despacho de mensajes y una línea de limpieza, sin
  reestructurar el bucle de heartbeat ya existente.
- **Desventajas aceptadas**: sin auto-cambio de sala, un cliente mal escrito que olvida
  mandar `leave_room` antes de un segundo `join_room` recibe un error en vez de que el
  sistema "adivine" la intención — se acepta porque hace el comportamiento predecible y
  testeable; sin validación de dominio sobre `remate_id`, es posible unirse a una sala
  para un remate inexistente — se acepta porque no tiene ningún efecto hoy (no hay
  broadcast ni nada que "pase" en una sala todavía) y el costo de agregarla después es
  bajo.
- Cuando el Event Bus se integre a este módulo (próxima etapa), su trabajo es: un
  suscriptor a `events.<remate_id>` (ya publicado por el dominio desde el Módulo 3.2)
  que, para cada evento recibido, llame a
  `RoomManager.connections_in_room(remate_id)` y reenvíe el evento a esas conexiones —
  ninguno de los dos managers (`ConnectionManager`, `RoomManager`) debería necesitar
  cambios: ya exponen exactamente lo que ese suscriptor necesita (`get(connection_id)`
  para resolver el `WebSocket` real, `connections_in_room(remate_id)` para saber a
  quién reenviar).
