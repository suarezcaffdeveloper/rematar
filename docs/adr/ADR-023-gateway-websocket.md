# ADR-023: Gateway WebSocket — ciclo de vida de conexión, heartbeat aplicativo, administrador en memoria

- **Fecha**: 2026-07-18
- **Estado**: Aceptada

## Contexto

[ADR-003](ADR-003-websockets-nativos-vs-socketio.md) y [ADR-006](ADR-006-autenticacion-jwt-en-http-y-websocket.md)
(Fase 0) ya decidieron **qué** mecanismo de transporte y **cómo** autenticar una
conexión WebSocket. Faltaba decidir el **detalle de implementación**: cómo se detecta
una conexión caída sin depender de configuración específica del servidor ASGI, cómo se
administra el conjunto de conexiones activas de una instancia de backend de forma que
un módulo futuro (salas, Épica 3.4) pueda apoyarse en él sin reescribirlo, y qué
códigos de cierre usa el protocolo propio.

## Decisión

### A. Heartbeat aplicativo (ping/pong de mensaje), no solo de protocolo

El Gateway envía `{"type": "ping"}` como mensaje de aplicación cuando no recibe nada
del cliente dentro de `WS_PING_INTERVAL_SECONDS`, y cierra la conexión si no llega un
`{"type": "pong"}` dentro de `WS_PONG_TIMEOUT_SECONDS` desde el último recibido. Es
heartbeat a nivel de mensaje JSON, con su propio lugar en el protocolo versionado —
no delega la detección de conexiones caídas a los frames de control de bajo nivel del
RFC 6455 (que uvicorn puede o no tener configurados según flags de arranque).

### B. `ConnectionManager` como registro en memoria, por instancia, con API `async`

Un único `ConnectionManager` por proceso (creado en el `lifespan`, igual que el
cliente Redis compartido del Módulo 3.1), respaldado por un `dict[UUID,
ConnectionContext]` sin locking explícito (una sola instancia de backend = un único
event loop = mutaciones de `dict` atómicas entre puntos de `await`). Sus métodos
públicos (`register`, `unregister`, `close_all`) son `async def` aunque hoy no hagan
ningún `await` real.

### C. Códigos de cierre propios en el rango 4000-4999

`4400` (mensaje inválido), `4401` (no autorizado), `4408` (timeout de autenticación),
`4000` (heartbeat sin respuesta) — además de los estándar `1011` (error interno) y
`1001` (apagado del servidor). RFC 6455 reserva 4000-4999 explícitamente para uso de
aplicación; se eligieron valores que evocan sus códigos HTTP análogos (400, 401, 408)
para que sean reconocibles sin tener que buscar la tabla.

### D. El Gateway no importa nada de `app/modules/` ni de `app/events/`

`app/websocket/` depende únicamente de `app/modules/auth/dependencies.py`
(`get_auth_service`, ya existente, sin modificar) para resolver la identidad del
usuario — ninguna otra dependencia de dominio. Es la misma disciplina de límites de
módulo que ya aplican `app/redis/` y `app/events/`.

### E. Testing: `TestClient` con una conexión de base de datos nueva por request

Los tests de HTTP existentes usan `httpx.AsyncClient` sobre `ASGITransport` dentro del
mismo event loop del test (ver `tests/conftest.py`). `TestClient` de Starlette —
necesario acá porque `httpx` no habla el protocolo WebSocket — corre la aplicación en
un hilo y un event loop **propios** (un "portal" de `anyio`), distinto del loop en el
que corre la función de test. Reusar el `AsyncEngine` de la fixture `db_engine`
(creado en el loop del test) desde ese hilo distinto produce el mismo error ya
documentado en `tests/conftest.py` para otro caso ("attached to a different loop").
La fixture `ws_client` (`tests/conftest.py`) resuelve esto creando una conexión de
base de datos **nueva en cada llamada** a la dependencia `get_db` sobreescrita —
usando la misma URL que `db_engine` (para que la tabla ya exista), pero sin reutilizar
el objeto `AsyncEngine` en sí, que es lo que está atado a un loop concreto.

## Alternativas consideradas

- **Ping/pong de protocolo (frames de control WebSocket, sin mensaje de aplicación)**:
  más liviano en bytes, pero depende de que el servidor ASGI concreto lo tenga
  configurado (`--ws-ping-interval` de uvicorn) y no es inspeccionable desde el código
  de la aplicación ni fácil de testear de forma determinística. Se descarta a favor de
  un heartbeat explícito en el protocolo propio que ADR-003 ya decidió construir a mano.
- **`ConnectionManager` respaldado por Redis** (por ejemplo, un hash con TTL por
  conexión) desde este mismo módulo: se descarta — el registro de conexiones de una
  instancia es, por definición, información que solo esa instancia necesita para
  administrar sus propios sockets; la coordinación *entre* instancias ya la resuelven
  Redis Pub/Sub (Módulo 3.1) y el Event Bus (Módulo 3.2) en la capa que corresponde
  (difusión de eventos), no en el registro de conexiones en sí. Mezclarlos acá
  acoplaría el Gateway a Redis sin necesidad — contradice el pedido explícito de este
  módulo ("no debe conocer... Event Bus").
- **Rechazar la conexión antes de aceptarla** (validar el JWT durante el handshake
  HTTP, antes de la actualización a WebSocket): no es viable sin pasar el token en la
  URL o en un header custom que no todos los clientes WS pueden setear con la misma
  facilidad — es exactamente el problema que ADR-006 ya resolvió al decidir
  autenticación en el primer mensaje, después de aceptar. No se reabre esa decisión.
- **Un solo código de cierre genérico (`1008`, "policy violation") para todo fallo de
  autenticación/protocolo**: más simple, pero le quita al cliente (y a quien lea logs)
  la distinción entre "tu mensaje estaba mal formado", "tu token no es válido" y "te
  demoraste en autenticar" — información barata de dar y potencialmente útil para
  debugging del lado del cliente.

## Consecuencias

- **Ventajas**: el heartbeat funciona igual sin importar qué servidor ASGI lo sirva;
  `ConnectionManager` es trivial de testear (dict en memoria, sin dependencias
  externas); los códigos de cierre dejan un rastro claro en logs sobre por qué se cortó
  cada conexión; el Gateway queda genuinamente reutilizable por cualquier módulo futuro
  sin haber anticipado de más su forma.
- **Desventajas aceptadas**: el heartbeat aplicativo consume algo más de ancho de banda
  que los frames de control nativos (mensajes JSON completos en vez de 2 bytes) — se
  acepta por la portabilidad y testabilidad que gana a cambio, a esta escala no es un
  costo relevante. La fixture de test con una conexión nueva por request es menos
  eficiente que reusar un engine — aceptable porque son pocos tests de un módulo de
  infraestructura, no la suite completa.
- Cuando el módulo de salas exista, su trabajo es: (a) una estructura de agrupamiento
  sobre `ConnectionManager.list_connections()`/`get()`, (b) un suscriptor a
  `events.<remate_id>` que reenvíe por WebSocket a esa sala, (c) mensajes nuevos en
  `messages.py` (`join_room`, etc.). Ninguno de los tres debería requerir cambiar
  `manager.py`, `auth.py` ni el bucle de heartbeat de `router.py`.
