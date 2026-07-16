# 09 — Arquitectura General y Decisiones

## Visión de la arquitectura

RematAR se implementa como un **monolito modular**: un único desplegable de backend
(FastAPI), organizado internamente en módulos con límites explícitos, corriendo en
**múltiples instancias sin estado compartido en memoria**, detrás de un balanceador de
carga. La coordinación entre instancias (difusión de eventos en tiempo real) pasa por
Redis; la consistencia de negocio (quién ganó una oferta) pasa exclusivamente por
PostgreSQL.

Módulos internos previstos (detalle de límites y contenido en [10-diagramas.md](10-diagramas.md)):

- **Auth**: usuarios, roles, emisión/validación de JWT.
- **Remates**: ciclo de vida de remates y lotes, sus máquinas de estado.
- **Bidding**: recepción, validación y resolución de ofertas en tiempo real; es el módulo
  más sensible del sistema (ver R-01 en [08-riesgos-tecnicos.md](08-riesgos-tecnicos.md)).
- **Realtime/Conexiones**: gestión de conexiones WebSocket y su integración con el
  backplane de Redis Pub/Sub.
- **Notificaciones**: seguimiento de remates, avisos de "superado", inicio de remate.
- **Streaming-integration**: módulo deliberadamente delgado, solo resuelve la URL externa
  de transmisión asociada a un remate (ver [ADR-005](adr/ADR-005-transmision-en-vivo-fuera-de-alcance-del-mvp.md)).

Por qué monolito modular y no microservicios desde el día uno, por qué Postgres es la
única fuente de verdad de negocio y Redis solo soporte, por qué WebSockets nativos y no
una librería como Socket.IO, y el resto de las decisiones con trade-offs reales, están
documentadas individualmente como ADR — no acá, para que cada una tenga su propio
contexto, alternativas consideradas y consecuencias aceptadas.

## Registro de decisiones de arquitectura (ADR)

| ADR | Título | Estado |
|---|---|---|
| [001](adr/ADR-001-modular-monolito-vs-microservicios.md) | Monolito modular vs. microservicios | Aceptada |
| [002](adr/ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md) | PostgreSQL como fuente de verdad, Redis como soporte (pub/sub, cache, rate limiting) | Aceptada |
| [003](adr/ADR-003-websockets-nativos-vs-socketio.md) | WebSockets nativos vs. Socket.IO | Aceptada |
| [004](adr/ADR-004-concurrencia-en-determinacion-de-ganador.md) | Concurrencia en la determinación del ganador de un lote | Aceptada |
| [005](adr/ADR-005-transmision-en-vivo-fuera-de-alcance-del-mvp.md) | Transmisión en vivo fuera del alcance del MVP | Aceptada |
| [006](adr/ADR-006-autenticacion-jwt-en-http-y-websocket.md) | Autenticación JWT en HTTP y en WebSocket | Aceptada |
| [007](adr/ADR-007-anti-sniping.md) | Anti-sniping: extensión automática de cierre de lote | Aceptada |
| [008](adr/ADR-008-snapshot-mas-delta-para-reconexion.md) | Reconexión: snapshot completo en vez de replay de eventos | Aceptada |
| [009](adr/ADR-009-redis-pubsub-vs-streams-para-fanout.md) | Redis Pub/Sub (no Streams) para el fan-out de tiempo real | Aceptada |
| [010](adr/ADR-010-enum-nativo-de-roles-en-postgres.md) | Enum nativo de PostgreSQL para el rol de usuario | Aceptada |
| [011](adr/ADR-011-refresh-tokens-persistidos-en-postgres.md) | Refresh tokens persistidos en PostgreSQL, con rotación | Aceptada |
| [012](adr/ADR-012-configuracion-de-remate-como-jsonb.md) | Configuración del remate como JSONB validado con Pydantic | Aceptada |
| [013](adr/ADR-013-categoria-de-remate-como-enum-nativo.md) | Categoría de remate como enum nativo de PostgreSQL | Aceptada |
| [014](adr/ADR-014-atributos-flexibles-de-lote-y-categoria-compartida.md) | Atributos flexibles de Lote como JSONB, y categoría compartida con Remate | Aceptada |
| [015](adr/ADR-015-numero-de-lote-y-orden-de-exhibicion-separados.md) | Número de lote y orden de exhibición como campos independientes | Aceptada |
| [016](adr/ADR-016-precio-de-reserva-oculto-a-compradores.md) | Precio de reserva oculto para compradores | Aceptada |
| [017](adr/ADR-017-invariante-un-lote-abierto-por-remate-como-indice-parcial.md) | Invariante "a lo sumo un lote OPEN por remate" (RF-12) como índice único parcial | Aceptada |
| [018](adr/ADR-018-cierre-de-lote-sin-motor-de-ofertas.md) | Cierre de lote sin motor de ofertas: resultado declarado por el rematador | Aceptada |
| [019](adr/ADR-019-finalizacion-automatica-de-remate.md) | Finalización automática del remate al resolverse el último lote (RF-10) | Aceptada |
| [020](adr/ADR-020-diseno-del-auction-engine.md) | Diseño del Auction Engine: concurrencia, estados, idempotencia, invariantes | Aceptada |
| [021](adr/ADR-021-integracion-de-redis.md) | Integración de Redis: cliente compartido y capas de infraestructura | Aceptada |
| [022](adr/ADR-022-arquitectura-de-eventos.md) | Arquitectura de eventos de dominio: Event Bus interno sobre Redis Pub/Sub | Aceptada |
| [023](adr/ADR-023-gateway-websocket.md) | Gateway WebSocket: heartbeat aplicativo, `ConnectionManager` en memoria, códigos de cierre propios | Aceptada |
| [024](adr/ADR-024-sistema-de-salas.md) | Sistema de salas: `RoomManager` en memoria, una sala por conexión, sin dependencias de dominio | Aceptada |
| [025](adr/ADR-025-sincronizacion-tiempo-real.md) | Sincronización de eventos en tiempo real: Event Consumer como único puente entre dominio y Gateway | Aceptada |
| [026](adr/ADR-026-snapshot-service.md) | Snapshot Service: reconstrucción de estado reutilizable por transporte, sin duplicar reglas de dominio | Aceptada |
| [027](adr/ADR-027-fundacion-frontend.md) | Fundación del frontend: estructura por dominio, Zustand, Tailwind, cliente HTTP con refresh transparente | Aceptada |

Plantilla para decisiones futuras: [adr/000-template.md](adr/000-template.md).

## Fase 1 — notas de arquitectura del backend

Además de los ADR de arriba (ADR-010 y ADR-011 se escribieron durante esta fase), la
Fase 1 implementó la base técnica del backend siguiendo esta documentación de Fase 0 sin
contradecirla. Dos hallazgos de esta fase, no previstos en el diseño original, quedan
registrados acá porque son relevantes para cualquier fase futura que toque este código:

- **Organización interna por módulo de dominio** (`app/modules/<dominio>/`), no por capa
  técnica plana. Ver la justificación completa en el [README](../README.md#por-qué-esta-organización-no-por-capa-técnica-por-módulo-de-dominio)
  — en resumen, refleja los límites de módulo que ADR-001 ya pedía, y es lo que hace
  viable extraer un módulo a un servicio separado el día que haga falta.
- **Conflictos de puertos en desarrollo**: la máquina de desarrollo tenía Postgres de
  otro proyecto en 5432 y otro proceso (un Postgres nativo de Windows) escuchando también
  en 5433, lo que causó fallas de autenticación intermitentes hasta detectar el conflicto
  con `netstat`. `docker-compose.yml` mapea el Postgres de RematAR al puerto 5434 del host
  por esta razón — no es una preferencia de diseño, es evitar un choque real observado en
  la práctica. Cualquier persona que levante este proyecto en una máquina distinta debería
  poder usar 5432 sin problema; se documenta acá para que quede claro que 5434 no es
  significativo, solo el primer puerto libre encontrado.

## Épica 2, Módulo 2.1 — notas de arquitectura del dominio Remate

Detalle completo del modelo en [docs/14-modulo-remate.md](14-modulo-remate.md). Acá solo
el resumen de lo que un lector de esta página necesita saber:

- Módulo nuevo `app/modules/remates/`, con la misma separación en capas que `users`/`auth`
  (models, schemas, repository, service, dependencies, router) más un `state_machine.py`
  propio — la máquina de estados de Remate es lo bastante importante como para no
  enterrarla dentro de `service.py`.
- No se tocó ningún archivo de `auth`, `users`, Docker ni configuración: los únicos
  archivos existentes modificados fueron `app/db/mixins.py` (se **agregó**
  `SoftDeleteMixin`, sin tocar los mixins de Fase 1), `app/db/base.py` y
  `app/api/router.py` (los dos puntos de extensión pensados exactamente para registrar
  un módulo nuevo, ver sus propios docstrings de Fase 1).
- El estado del remate se implementa con las seis transiciones completas modeladas
  (`state_machine.ALLOWED_TRANSITIONS`), pero solo tres quedan expuestas por HTTP en
  esta fase (crear, programar, cancelar) — `iniciar`/`pausar`/`reanudar`/`finalizar`
  dependen de que existan Lotes (RF-08) y se agregan en el módulo que los implemente,
  reutilizando esta misma tabla de transiciones.

## Épica 2, Módulo 2.2 — notas de arquitectura del dominio Lote

Detalle completo del modelo en [docs/15-modulo-lote.md](15-modulo-lote.md). Acá solo el
resumen de lo que un lector de esta página necesita saber:

- `Lote` vive en `app/modules/remates/lotes/`, un sub-paquete **dentro** del módulo
  `remates` (no un módulo nuevo al mismo nivel que `auth`/`users`/`remates`), porque
  `Remate` y `Lote` son, por diseño de Fase 0, el mismo módulo interno ("Remates: ciclo de
  vida de remates y lotes"). Mismo set de archivos que `remates/` (`models.py`,
  `schemas.py`, `repository.py`, `service.py`, `dependencies.py`, `router.py`,
  `state_machine.py`).
- Los únicos archivos existentes modificados fueron, otra vez, los dos puntos de
  extensión ya usados en el Módulo 2.1: `app/db/base.py` y `app/modules/remates/router.py`
  (una línea de `include_router` para montar `/remates/{remate_id}/lotes`).
- CRUD completo (crear, ver, editar, eliminar, reordenar) sin ninguna transición de
  estado expuesta: todo lote se crea en `PENDING` y queda ahí. `lotes/state_machine.py`
  modela las cinco transiciones completas de todos modos, mismo patrón que
  `remates/state_machine.py`, para que el módulo de Ofertas las reutilice sin
  rediseñarlas.
- Cuatro ADR nuevos (014 a 017): atributos flexibles + categoría compartida, número de
  lote vs. orden de exhibición, ocultamiento del precio de reserva, e índice único
  parcial para la invariante RF-12 aplicado preventivamente.

## Épica 2, Módulo 2.3 — notas de arquitectura del motor de estados

Detalle completo en [docs/16-motor-de-estados.md](16-motor-de-estados.md). Resumen:

- No se crea ningún paquete nuevo: se extienden `remates/service.py` (`start`, `pause`,
  `resume`, `finish`, `try_auto_finish`) y `remates/lotes/service.py` (`open`,
  `open_next`, `close`, `cancel`), sus repositorios (nuevas consultas de solo lectura) y
  sus routers (nuevos endpoints). Las tablas de transición
  (`remates/state_machine.py`, `remates/lotes/state_machine.py`) no cambiaron desde los
  Módulos 2.1/2.2 — ya modelaban todas las transiciones, solo faltaba invocarlas.
- Único acoplamiento nuevo: `RemateService` gana una dependencia de solo lectura a
  `LoteRepository` (no a `LoteService`, para evitar un import circular con
  `remates/lotes/service.py`, que ya depende de `RemateService`) — ver
  [ADR-019](adr/ADR-019-finalizacion-automatica-de-remate.md).
- Dos ADR nuevos (018, 019): cómo cerrar un lote sin motor de ofertas todavía (resultado
  declarado por el rematador), y dónde vive la finalización automática del remate
  (RF-10).
- `docs/14-modulo-remate.md` y `docs/15-modulo-lote.md` se corrigieron: ambos asumían que
  abrir/cerrar/cancelar un lote llegaría junto con Ofertas; en la práctica llegó antes,
  sin bidding (regla 5 de [docs/README.md](../docs/README.md#reglas-de-esta-documentación-aplican-a-todas-las-fases-futuras)).

## Épica 2.4 — notas de arquitectura del Auction Engine

Detalle completo en [docs/17-auction-engine.md](17-auction-engine.md) y
[ADR-020](adr/ADR-020-diseno-del-auction-engine.md). Resumen:

- `Oferta` vive en `app/modules/ofertas/`, un módulo **nuevo, top-level** — no un
  sub-paquete de `remates` como `Lote`. `09` (este documento) ya distinguía "Bidding"
  como módulo propio desde Fase 0; esta épica ejecuta esa separación, no la inventa.
  `engine.py` (no `service.py`) contiene `AuctionEngine`, mismo criterio de nombre de
  archivo que ya estableció `remates/state_machine.py` en el Módulo 2.1 para un
  componente lo bastante central como para merecer su propio archivo.
- Único cambio en código ya existente de `remates`/`lotes`: una función nueva y aditiva,
  `LoteRepository.get_by_id_for_update`, que pone en práctica por primera vez el lock de
  fila que [ADR-004](adr/ADR-004-concurrencia-en-determinacion-de-ganador.md) (Fase 0) ya
  exigía. `RemateService`/`LoteService` no se tocan.
- Ofertas rechazadas por reglas de negocio (remate pausado, lote cerrado, monto
  insuficiente) se persisten como `Oferta REJECTED` con motivo (RF-18) — nunca como error
  HTTP; solo fallas de autorización/enrutamiento (rol, suspensión, visibilidad) devuelven
  403/404 sin persistir nada. Ver ADR-020, sección C.
- Idempotencia (`client_token`) para que un reintento de red no duplique una oferta —
  anticipado desde el glosario de Fase 0.
- El motor es transporte-agnóstico por diseño: el mismo `AuctionEngine.place_bid` que
  usan los endpoints HTTP de esta fase es el que va a llamar el futuro handler de
  WebSocket, sin cambios.

## Épica 3, Módulo 3.1 — notas de arquitectura de la integración de Redis

Detalle completo en [docs/18-integracion-redis.md](18-integracion-redis.md) y
[ADR-021](adr/ADR-021-integracion-de-redis.md). Resumen:

- `app/redis/` — carpeta transversal nueva, al mismo nivel que `app/db/`, sin modelos de
  negocio. Un único cliente Redis compartido (`app.state.redis`, creado en el `lifespan`
  de `app/main.py`), a diferencia de `get_db` (una sesión nueva por request) — Redis ya
  administra su propio pool de conexiones, pensado para vivir tanto como el proceso.
- Cuatro capas de infraestructura genéricas y ya funcionales pero sin ningún consumidor
  de dominio todavía: `RedisCache`, `RedisPubSub`, `RedisStreams`, `RedisLockFactory`.
  Ninguna conoce `Remate`/`Lote`/`Oferta`.
- `/health` reporta el estado de Redis (`checks.redis`) pero nunca devuelve `503` por su
  causa — Redis sigue siendo soporte, nunca fuente de verdad (ADR-002), y hoy ningún
  endpoint depende de él para funcionar.
- Cero cambios en `app/modules/` — Auth, Users, Remates, Lotes y Ofertas quedan
  exactamente como estaban.

## Épica 3, Módulo 3.2 — notas de arquitectura de eventos

Detalle completo en [docs/19-arquitectura-de-eventos.md](19-arquitectura-de-eventos.md) y
[ADR-022](adr/ADR-022-arquitectura-de-eventos.md). Resumen:

- `app/events/` — infraestructura transversal nueva (`DomainEvent`, `RemateScopedEvent`,
  `EventBus` como `Protocol`, `RedisEventBus`). Los eventos concretos viven en cada
  módulo de dominio (`remates/events.py`, `remates/lotes/events.py`,
  `ofertas/events.py`), igual que sus modelos, repos y servicios.
- Único cambio permitido (y aplicado) en el dominio existente: `RemateService`,
  `LoteService` y `AuctionEngine` ganaron un parámetro `event_bus` y una llamada a
  `publish(...)` al final de cada transición relevante — ninguna validación ni regla de
  negocio cambió (la suite completa de los Módulos 2.1 a 2.4 sigue pasando sin
  modificaciones).
- Un canal de Redis Pub/Sub por remate (`events.<remate_id>`), no uno por tipo de
  evento — pensado directamente para que el módulo de WebSockets se suscriba una sola
  vez por remate.
- `EventBus.publish` nunca lanza (best-effort, extensión de ADR-002): una caída de Redis
  nunca hace fallar una operación de negocio ya confirmada en Postgres.

## Épica 3, Módulo 3.3 — notas de arquitectura del Gateway WebSocket

Detalle completo en [docs/20-gateway-websocket.md](20-gateway-websocket.md) y
[ADR-023](adr/ADR-023-gateway-websocket.md). Resumen:

- `app/websocket/` — infraestructura transversal nueva, al mismo nivel que `app/redis/`
  y `app/events/`, sin modelos de dominio. Implementa el endpoint `/api/v1/ws`, la
  autenticación en el primer mensaje que ADR-006 ya había decidido en Fase 0, un
  heartbeat aplicativo (ping/pong de mensaje, no de protocolo) y un `ConnectionManager`
  en memoria por instancia de backend.
- Cero conocimiento de dominio: el Gateway no importa nada de `app/modules/` salvo
  `AuthService.get_current_user_from_access_token` (sin modificar) ni de `app/events/`
  — todavía no reenvía ningún evento de dominio a clientes conectados.
- Códigos de cierre propios en el rango 4000-4999 (`4400`, `4401`, `4408`, `4000`),
  además de los estándar (`1001`, `1011`) — dejan un rastro claro en logs de por qué se
  cortó cada conexión.
- Cero cambios en `app/modules/auth/` ni en el resto de los módulos de dominio.
- Deja preparado (sin implementarlo) el punto de apoyo para el módulo de salas: agrupar
  conexiones por remate y reenviar `events.<remate_id>` (Módulo 3.2) a esas conexiones.

## Épica 3, Módulo 3.4 — notas de arquitectura del sistema de salas

Detalle completo en [docs/21-sistema-de-salas.md](21-sistema-de-salas.md) y
[ADR-024](adr/ADR-024-sistema-de-salas.md). Resumen:

- `app/websocket/rooms.py` — `RoomManager` en memoria, con un índice bidireccional
  (`remate_id -> {connection_id}` y su inverso) para que unirse/salir/consultar la sala
  de una conexión sean todas operaciones `O(1)`.
- Invariante "una sala por conexión" aplicada por rechazo explícito, no por
  auto-cambio: un `join_room` a una sala distinta de la actual devuelve un error y no
  cambia nada — el cliente tiene que mandar `leave_room` primero.
- Sin ninguna validación de dominio sobre `remate_id` (no se verifica que exista un
  `Remate` real) — decisión explícita de alcance de esta épica, misma disciplina de
  límites de módulo que ya rige el resto de `app/websocket/`.
- Eliminación automática de salas vacías integrada en la misma operación de salida, sin
  proceso de limpieza aparte.
- Único cambio de comportamiento en `router.py`: despacha `join_room`/`leave_room` y
  suma una línea al `finally` que ya limpiaba `ConnectionManager`. `manager.py` y
  `auth.py` (Módulo 3.3) quedan exactamente como estaban.
- `RoomManager.connections_in_room(remate_id)` + `ConnectionManager.get(connection_id)`
  ya son, juntos, todo lo que un futuro suscriptor al Event Bus necesita para reenviar
  eventos de dominio a una sala — sin que ninguno de los dos managers deba cambiar.

## Épica 3, Módulo 3.5 — notas de arquitectura de la sincronización en tiempo real

Detalle completo en [docs/22-sincronizacion-tiempo-real.md](22-sincronizacion-tiempo-real.md)
y [ADR-025](adr/ADR-025-sincronizacion-tiempo-real.md). Resumen:

- `app/realtime/` — paquete transversal nuevo, el único que conoce a la vez el Event
  Bus (Módulo 3.2) y el Gateway/Room Manager (Módulos 3.3/3.4). `EventConsumer`
  (`psubscribe("events.*")`, un único suscriptor de patrón, no uno por sala) alimenta a
  `EventDispatcher` (interpreta contra una whitelist en `registry.py`, resuelve la sala
  por el propio `remate_id` del evento, entrega vía `RoomManager`/`ConnectionManager`).
- Cero cambios en `app/modules/ofertas/` (Auction Engine), `app/modules/remates/`,
  `app/websocket/` (Gateway y `RoomManager`), `app/modules/auth/` y `app/events/`
  (Event Bus) — verificado también con un test estático de límites de import
  (`tests/test_architecture_boundaries.py`).
- Procesamiento estrictamente secuencial (`async for` sin `asyncio.gather`): es lo que
  garantiza que el Event Consumer nunca tenga dos `send_text` concurrentes hacia la
  misma conexión, sin necesitar un lock en `manager.py` — se investigó el código fuente
  exacto de `websockets`/`uvicorn` que usa el proyecto para confirmar que un `ping` de
  heartbeat y un evento de dominio conviviendo en la misma conexión no corrompen frames
  (ver ADR-025, sección C).
- Reconexión automática a Redis con backoff exponencial y reseteo del contador tras una
  resuscripción exitosa.
- 12 eventos sincronizados (los 10 pedidos + `RemateCancelled`/`LoteCancelled`), vía una
  whitelist explícita — un evento no listado en `registry.py` nunca llega a un cliente,
  aunque se publique en el canal.

## Épica 3, Módulo 3.6 — notas de arquitectura del Snapshot Service

Detalle completo en [docs/23-snapshot-service.md](23-snapshot-service.md) y
[ADR-026](adr/ADR-026-snapshot-service.md). Resumen:

- `app/snapshot/` — paquete transversal nuevo, implementa por primera vez RF-16/ADR-008
  (snapshot completo al conectar, decidido en Fase 0). `SnapshotService.build` combina
  `RemateService.get_visible_or_raise` (visibilidad), una consulta propia optimizada
  para el lote `OPEN` (índice único parcial de ADR-017, no existía un método reusable
  para esto), `OfertaRepository.get_leading_offer`/`list_by_lote` (ya existían) y una
  caché corta en Redis (best-effort) del recorte más costoso de recalcular.
- Reutilizable de verdad, no solo declarado: recibe `connected_users` como un `int`
  simple (nunca un `RoomManager`), y se prueba con tests reales tanto desde
  `GET /remates/{id}/snapshot` (HTTP) como desde el Gateway WebSocket, confirmando la
  misma forma de respuesta en ambos casos.
- Cero cambios en el dominio, el Auction Engine, el Event Bus, Redis, el Room Manager y
  el Event Consumer; único cambio permitido en el Gateway: `router.py` llama a
  `SnapshotService.build` después de un `join_room` exitoso — verificado con tests de
  límites de import.
- Hallazgo no anticipado: las dependencias HTTP-only ya existentes
  (`get_cache`/`get_remate_service`, que encadenan hasta `get_redis_client(request:
  Request)`) rompen si se reusan tal cual desde una ruta WebSocket — `Request` no es
  inyectable ahí. Se resolvió con `HTTPConnection` (clase base común de `Request` y
  `WebSocket`), sin modificar `app/redis/` ni `app/modules/remates/` (ADR-026, sección
  F) — el mismo patrón sirve para cualquier dependencia futura que necesite Redis/DB
  desde ambos transportes.
- El estado que se cachea es siempre el crudo, sin enmascarar; el enmascarado de
  `reserve_price`/`buyer_id` se aplica después de leer (de caché o de la base), según
  el viewer de cada pedido puntual — evita que la respuesta cacheada para un dueño
  filtre datos sensibles a un comprador dentro del mismo TTL.

## Épica 4, Módulo 4.1 — notas de arquitectura de la fundación del frontend

Detalle completo en [docs/24-fundacion-frontend.md](24-fundacion-frontend.md) y
[ADR-027](adr/ADR-027-fundacion-frontend.md). Resumen:

- `frontend/` nuevo, al lado de `backend/` — React + Vite + TypeScript (Fase 0), con
  `features/<dominio>/` (mismo criterio que `app/modules/<dominio>/` del backend) +
  `shared/` (transversal) + `app/` (ensamblaje: router, layouts).
- Tailwind v4 en vez de CSS Modules, y Zustand en vez de Context API — ambas
  justificadas explícitamente (la épica lo pedía): Tailwind por la cantidad de estado
  visual cambiante que va a tener la interfaz; Zustand porque el diferencial del
  proyecto (tiempo real) necesita suscripción por selector, no notificación a todo un
  subárbol de React como hace `Context.Provider`.
- Cliente Axios centralizado (`shared/api/client.ts`) con JWT automático, refresh
  transparente ante 401 con cola single-flight (evita invalidar el refresh token
  rotado del backend, ver ADR-011, si dos requests fallan a la vez), e inversión de
  dependencias con el store de sesión para evitar un import circular de tres módulos.
- Hallazgo no anticipado, verificado empíricamente (reproducible en `vite dev` y en
  `vite preview`, no un artefacto de Hot Module Replacement): con `localStorage`
  (síncrono), Zustand ejecuta `onRehydrateStorage` durante la propia llamada a
  `create(...)`, antes de que la constante del store termine de asignarse —
  referenciarla desde ese callback tira `ReferenceError`/`TypeError` según el entorno.
  Se resolvió capturando `set` del creator en una variable de módulo en vez de
  referenciar el store ya creado (ADR-027, sección H).
- Guards de ruta (`RequireAuth`, `RequireRole`) como elementos de ruta sin `path`
  propio, anidables en el árbol de `createBrowserRouter` — agregar una ruta protegida
  nueva no requiere tocar ninguno de los dos.
- Cero cambios en `backend/` — único archivo compartido tocado fuera de `frontend/`:
  `docker-compose.yml` (un servicio `frontend` nuevo, aditivo).
