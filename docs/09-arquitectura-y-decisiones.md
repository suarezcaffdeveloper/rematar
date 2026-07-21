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
| [028](adr/ADR-028-dashboard-comprador.md) | Dashboard del comprador: carga completa + filtrado client-side, N+1 acotado para lote count, sin nombre de rematador | Aceptada |
| [029](adr/ADR-029-detalle-remate.md) | Detalle del remate: rematador mostrado honestamente sin nombre real, hooks de carga independientes, sala en su propia ruta | Aceptada |
| [030](adr/ADR-030-sala-del-remate.md) | Sala del remate: feature propio espejando el límite de módulo del Snapshot Service, montos como string, sin polling | Aceptada |
| [031](adr/ADR-031-websocket-tiempo-real-sala.md) | Integración WebSocket en la Sala del Remate: cliente genérico de transporte, snapshot por WS como reconciliador, anonimato re-aplicado en eventos crudos | Aceptada |
| [032](adr/ADR-032-dashboard-rematador.md) | Dashboard del Rematador: extender `features/remates/` para el recurso, feature nuevo para la experiencia, sin botón "Pausar" | Aceptada |
| [033](adr/ADR-033-consola-operativa-rematador.md) | Consola Operativa del Rematador: paneles propios en vez de extender los del comprador, y por qué no refrescar por HTTP después de una acción | Aceptada |
| [034](adr/ADR-034-gestion-remates-lotes.md) | Gestión completa de Remates y Lotes: "programar"/"publicar" consolidados, duplicar compuesto en el cliente, drag & drop nativo con fallback obligatorio | Aceptada |
| [035](adr/ADR-035-gestion-multimedia-lotes.md) | Gestión multimedia de lotes: endpoint nuevo de subida a disco local (brecha documentada antes de implementar), galería "viva" con PATCH inmediato, sin galería en modo creación | Aceptada |
| [036](adr/ADR-036-sistema-de-presencia.md) | Sistema de presencia: `PresenceService` compositor, sin modificar `RoomManager`/`ConnectionManager` | Aceptada |
| [037](adr/ADR-037-chat-del-remate.md) | Chat del remate: módulo de dominio propio, segundo `EventConsumer` idempotente, keyset sobre offset | Aceptada |

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

## Épica 4, Módulo 4.3 — notas de arquitectura del dashboard del comprador

Detalle completo en [docs/25-dashboard-comprador.md](25-dashboard-comprador.md) y
[ADR-028](adr/ADR-028-dashboard-comprador.md). Resumen:

- Primera pantalla de producto real, sobre la fundación de la Módulo 4.1: `HomePage`
  se ramifica por rol (`comprador` → `CompradorDashboardPage`; el resto sigue con el
  placeholder existente), y `features/remates/` nace con el mismo esqueleto que
  `features/auth/` (`api.ts`, `types.ts`, `hooks.ts`).
- `GET /remates` no expone búsqueda de texto (solo `category`/`status`/`owner_id`) —
  `useRemates` pagina internamente hasta juntar la lista completa (tope de 500) y
  `filterAndSortRemates` (función pura) filtra/ordena client-side. Paginar
  server-side y filtrar solo la página visible habría dado resultados de búsqueda
  incompletos.
- `RemateRead` no expone cantidad de lotes: `useLoteCount` pide
  `GET /remates/{id}/lotes?page_size=1` de forma perezosa, una vez por tarjeta
  efectivamente renderizada (N+1 deliberado y acotado, no una optimización pendiente).
- Sin forma de resolver `owner_id` a un nombre (no hay `GET /users/{id}`, `GET /users`
  es solo-admin): la tarjeta omite el rematador por completo en vez de mostrar un UUID
  crudo.
- Cero cambios en `backend/`, en la autenticación, ni en componentes/layouts
  preexistentes — únicas ediciones a código ya existente: `HomePage.tsx` (rama por
  rol) y `router.tsx` (una ruta nueva), ambas ya anticipadas en ADR-027.

## Épica 4, Módulo 4.4 — notas de arquitectura del detalle del remate

Detalle completo en [docs/26-detalle-remate.md](26-detalle-remate.md) y
[ADR-029](adr/ADR-029-detalle-remate.md). Resumen:

- `/remates/:remateId` deja de ser el placeholder del Módulo 4.3 y pasa a ser la
  página de detalle real; el placeholder (renombrado `SalaPlaceholderPage`) se muda a
  su propia ruta, `/remates/:remateId/sala` — destino de "Entrar al remate", listo para
  que un módulo futuro lo reemplace por la sala real sin tocar el árbol de rutas.
- Dos hooks de carga independientes (`useRemateDetail`, `useLotes`): un fallo al traer
  los lotes no tira abajo la información del remate que sí cargó bien, cada sección
  tiene su propio `Alert` con su propio reintento.
- El rematador dueño, sin nombre resoluble (mismo hueco que ADR-028), se muestra como
  "Rematador verificado" + un fragmento corto del `owner_id` — a diferencia del
  dashboard (que lo omite), acá el enunciado lo pide como campo mínimo explícito, así
  que se resuelve mostrándolo honestamente en vez de ocultarlo o inventar un nombre.
- `CoverPlaceholder` se extrajo de `RemateCard` (antes local, no exportado) a un
  componente compartido del feature, reutilizado también por `RemateDetailHeader` y
  `LoteCard`.
- Cero cambios en `backend/` ni en la autenticación — mismos dos endpoints que ya
  consumía el dashboard (`GET /remates/{id}`, `GET /remates/{id}/lotes`).

## Épica 4, Módulo 4.5 — notas de arquitectura de la sala del remate

Detalle completo en [docs/27-sala-del-remate.md](27-sala-del-remate.md) y
[ADR-030](adr/ADR-030-sala-del-remate.md). Resumen:

- Toda la pantalla sale de una única lectura de `GET /remates/{id}/snapshot` (Épica 3,
  Módulo 3.6) — sin WebSockets, sin polling, pedido explícito de este módulo pese a que
  el backend ya los tiene completos.
- `features/sala/` nace como feature propio (no una extensión de `features/remates/`),
  espejando el límite de módulo que el backend ya traza entre `app/snapshot/` y
  `app/modules/remates/`/`app/modules/ofertas/`: compone `Remate`/`Lote` existentes con
  un DTO propio (`OfertaSnapshotEntry`), sin duplicarlos.
- Montos de dinero tipados como `string`, no `number` — verificado contra una respuesta
  real del backend (`"base_price": "1000.00"`): Pydantic v2 serializa `Decimal`
  preservando su representación exacta, evitando el error de redondeo de `float` en
  precios.
- El `buyer_id` de cada oferta llega siempre `null` para un comprador (incluso para el
  propio postor) — comportamiento esperado del backend (`SnapshotService._mask_oferta`,
  sin cambios), no una limitación: la sala muestra "Comprador verificado" en vez de
  cualquier identidad.
- Preparación para WebSockets por contrato de props, no código simulado: los
  componentes de presentación reciben `RemateStateSnapshot` ya resuelto y no importan
  `features/sala/api.ts`/`hooks.ts` — agregar tiempo real es un cambio acotado a
  `hooks.ts`/`SalaPage.tsx`.
- Cero cambios en `backend/` ni en la autenticación.

## Épica 4, Módulo 4.6 — notas de arquitectura de la integración WebSocket

Detalle completo en [docs/28-websocket-tiempo-real-sala.md](28-websocket-tiempo-real-sala.md)
y [ADR-031](adr/ADR-031-websocket-tiempo-real-sala.md). Resumen:

- `shared/websocket/client.ts` — cliente WebSocket genérico y reutilizable, transversal
  (no conoce ningún dominio): implementa únicamente el protocolo del Gateway (auth en el
  primer mensaje vía `getToken()` inyectado, heartbeat aplicativo, reconexión con backoff
  exponencial 1s→30s con re-unión automática a la sala, salas `join_room`/`leave_room`,
  cierre limpio). `onMessage`/`send` entregan/envían cualquier mensaje sin filtrar --
  punto de extensión ya resuelto para un futuro Chat/Presencia/Notificaciones/Streaming.
- `features/sala/realtime/` — capa específica de dominio sobre ese cliente genérico:
  tipos de los 12 eventos sincronizados (`events.ts`), envelopes `snapshot`/
  `domain_event` (`messages.ts`), y un reducer puro (`reducer.ts`) que aplica cada
  evento sobre el `RemateStateSnapshot` en memoria compartiendo referencia con todo lo
  que no cambió (aprovecha el `React.memo` ya aplicado en el Módulo 4.5).
- El snapshot llega dos veces: por HTTP (`useRemateSnapshot`, sin cambios, pinta de
  inmediato) y por WebSocket (`SnapshotMessage`, ya integrado en el backend desde el
  Módulo 3.6, tras cada `join_room`) -- la segunda REEMPLAZA a la primera y es lo que
  reconcilia automáticamente cualquier evento perdido durante una reconexión, sin
  ningún mecanismo nuevo del lado del cliente.
- `lote.opened` solo trae `lote_id` (no el lote completo) -- se reconstruye buscándolo
  en la lista ya cargada por `useLotes` (reusado tal cual de `features/remates/`).
- `oferta.rejected` se descarta deliberadamente: el Event Dispatcher del backend reenvía
  `buyer_id` sin enmascarar a toda la sala (a diferencia del Snapshot Service), y
  `PlaceBidButton` sigue deshabilitado en este módulo -- mostrarlo filtraría intentos
  ajenos, violando una política ya establecida desde `docs/06-eventos-del-sistema.md`.
  Las entradas nuevas de historial (`oferta.accepted`/`winner_changed`) fuerzan
  `buyer_id: null` incondicionalmente, re-aplicando del lado del cliente la misma
  máscara de anonimato que el Snapshot Service ya aplica en el estado inicial.
- Único cambio en un componente de presentación ya existente: `SalaHeader` gana el prop
  `connectionStatus` (aditivo) para mostrar `ConnectionStatusBadge`
  (Conectando.../Conectado/Reconectando.../Desconectado). El resto de los componentes de
  la Módulo 4.5 no cambia una línea.
- Cero cambios en `backend/` (Gateway, Snapshot Service, Event Bus, RoomManager, Auction
  Engine) ni en la autenticación.

## Épica 5, Módulo 5.1 — notas de arquitectura del Dashboard del Rematador

Detalle completo en [docs/29-dashboard-rematador.md](29-dashboard-rematador.md) y
[ADR-032](adr/ADR-032-dashboard-rematador.md). Resumen:

- Extensión aditiva de `features/remates/` para todo lo que opera sobre el recurso
  `Remate` (mismo router del backend que ya tenía el CRUD): `api.ts` gana
  `startRemateRequest`/`resumeRemateRequest`/`finishRemateRequest`; `useRemates` gana un
  parámetro opcional `ownerId`; `DashboardToolbar` gana un prop opcional
  `statusOptions`; `RemateFilters.status` se ensancha a `RemateStatus | 'all'` -- los
  cuatro cambios retrocompatibles, `CompradorDashboardPage` sigue pasando sin
  modificaciones.
- `features/rematador/` nuevo, solo para la experiencia de producto (página, tarjetas,
  hook de información operativa) -- mismo criterio de crecimiento futuro que ya
  justificó separar `features/sala/` en ADR-030, aplicado acá al nivel de
  página/componentes, no al de llamadas HTTP del recurso (que sí se comparten).
- `useRemateOperationalInfo` resuelve lote activo/próximo pidiendo `GET
  /remates/{id}/lotes` (siempre) y "conectados" reusando `fetchRemateSnapshotRequest`
  de `features/sala/api.ts` (solo si el remate está `live`/`paused` -- pedirlo en
  cualquier otro estado siempre daría `0` sin aportar información real).
- Acciones de ciclo de vida (`Iniciar`/`Reanudar`/`Finalizar`) validan preventivamente en
  la UI las mismas precondiciones que el backend ya exige (al menos un lote para
  iniciar, ningún lote abierto para finalizar) antes de deshabilitar el botón
  correspondiente -- primer uso real de `useToastStore` (existía desde la fundación del
  frontend sin consumidores) para el feedback de éxito/error.
- Deliberadamente sin botón "Pausar": es una acción de control en vivo que corresponde a
  la Consola Operativa del Rematador (Módulo 5.2, para la que ya queda resuelta la ruta
  `/remates/:remateId/gestionar` con un placeholder) -- "Reanudar" sigue teniendo sentido
  en este dashboard de repaso para retomar un remate pausado en una sesión anterior.
- Verificado de punta a punta contra el backend real en Docker Compose (registro de un
  rematador, remates en `draft`/`scheduled` con y sin lotes, acción "Iniciar" desde la
  UI con toast y actualización de estado, navegación a "Administrar").
- Cero cambios en `backend/`, en la autenticación, ni en `features/sala/`.

## Épica 5, Módulo 5.2 — notas de arquitectura de la Consola Operativa del Rematador

Detalle completo en [docs/30-consola-operativa-rematador.md](30-consola-operativa-
rematador.md) y [ADR-033](adr/ADR-033-consola-operativa-rematador.md). Resumen:

- `ConsolaOperativaPage` reemplaza el placeholder de la Épica 5.1 en la misma ruta
  (`/remates/:remateId/gestionar`) y reutiliza `useLiveRemateState` de
  `features/sala/hooks.ts` (Épica 4.6) **sin modificarlo** -- la consola es, en los
  hechos, una segunda conexión a la misma sala del remate: recibe exactamente los mismos
  eventos que un comprador con la Sala abierta, por el mismo canal.
- Paneles nuevos y propios en `features/rematador/components/`
  (`ConsolaLotePanel`/`ConsolaOfferPanel`/`ConsolaUpcomingLotesPanel`) en vez de extender
  los de `features/sala/` (`ActiveLotePanel`/`OfferHistoryPanel`/`UpcomingLotesStrip`):
  esos embeben `PlaceBidButton` o son deliberadamente de solo lectura, y esta fase
  prioriza cero riesgo sobre la experiencia del comprador por encima de un ahorro de
  código modesto. Sí se reutilizan tal cual los componentes verdaderamente puros
  (`ImageGallery`, `ConnectionStatusBadge`).
- Las seis acciones del panel de control (abrir lote, pasar al siguiente, cerrar lote,
  pausar, reanudar, finalizar) llaman a un endpoint del motor de estados y **no**
  refrescan nada por HTTP -- confían en que el evento de dominio que la propia acción
  dispara vuelva por el mismo WebSocket ya conectado.
- Hallazgo verificado en vivo (no en tests, que mockean el transporte): un refresco HTTP
  "de respaldo" tras una acción exitosa podía traer una respuesta cacheada por
  `SnapshotService` (Redis, TTL de 2s, Épica 3.6) de *antes* de la acción, pisando el
  estado correcto que el WebSocket ya había aplicado. Se eliminó ese refresco por
  completo -- el evento de WebSocket solo demostró ser, en la práctica, más rápido y más
  confiable que un `reload()` HTTP adicional.
- Verificado de punta a punta contra el backend real en Docker Compose: abrir/cerrar
  lotes, pasar al siguiente, pausar/reanudar, finalizar (con confirmación), una oferta
  real de un comprador reflejada en el panel sin recargar la página, y la finalización
  automática al resolverse el último lote (RF-10), reflejada en vivo sin recargar.
- Cero cambios en `backend/`, en la autenticación, ni en `features/sala/`.

## Épica 5, Módulo 5.3 — notas de arquitectura de la Gestión de Remates y Lotes

Detalle completo en [docs/31-gestion-remates-lotes.md](31-gestion-remates-lotes.md) y
[ADR-034](adr/ADR-034-gestion-remates-lotes.md). Resumen:

- El enunciado lista "Programar remate" y "Publicar remate" como acciones separadas, pero
  el motor de estados solo tiene una transición `draft` → `scheduled`
  (`POST .../schedule`) -- se consolidaron en un único botón/ítem de menú "Publicar
  remate" en vez de exponer dos controles para la misma llamada HTTP.
- Sin endpoint de "duplicar" en el backend (restricción "no modificar el backend"):
  `features/rematador/duplication.ts` compone `duplicateRemate`/`duplicateLote` con
  GET + POST secuenciales sobre endpoints ya existentes, generando un `lot_number` único
  con sufijos (`-copia`, `-copia-2`, ...) para no chocar con el índice único de
  `(remate_id, lot_number)`.
- Reordenamiento de lotes con HTML5 Drag and Drop nativo (sin librería, mismo criterio de
  ADR-027), actualización optimista con revert-on-error sobre el endpoint de reorder ya
  existente; botones ↑/↓ en cada tarjeta como mecanismo de reordenamiento **siempre
  disponible**, no un fallback cosmético -- HTML5 DnD no funciona en pantallas táctiles.
- Cinco componentes genéricos nuevos en `shared/components/` (`Modal`, `ConfirmModal`,
  `Textarea`, `Select`, `DropdownMenu`), sin ningún conocimiento del dominio Remate/Lote,
  reutilizables por cualquier módulo futuro.
- "Peso" se mapea a un campo dedicado dentro de `attributes.peso_kg` (JSONB de forma
  libre, ADR-014), separado del editor dinámico de "Información técnica"; "Estado" del
  lote se muestra como un badge de solo lectura -- mientras la estructura es editable,
  todo lote está siempre en `pending`, no hay ninguna transición que disparar desde este
  formulario.
- `LotesManagementPage` (nueva, en `/remates/:remateId/lotes`) reemplaza el placeholder
  que dejó la Épica 5.1 en esa ruta y reutiliza `useRemateDetail`/`useLotes`
  (`features/remates/hooks.ts`, Épica 4.4) sin modificarlos.
- Verificado de punta a punta contra el backend real en Docker Compose: creación de
  remate y navegación a su gestión de lotes, alta/edición/duplicado/eliminación de lotes,
  reordenamiento por drag & drop y por botones (persistido tras recargar), edición y
  publicación del remate, congelamiento de la estructura al pasar a estado en vivo,
  duplicado del remate completo, cancelación con motivo, eliminación de un borrador.
- Cero cambios en `backend/` ni en la autenticación.

## Épica 6, Módulo 6.1 — notas de arquitectura de la Gestión Multimedia de los Lotes

Detalle completo en [docs/32-gestion-multimedia-lotes.md](32-gestion-multimedia-lotes.md)
y [ADR-035](adr/ADR-035-gestion-multimedia-lotes.md). Resumen:

- El backend no tenía ninguna capacidad de subida binaria (`Lote.images` era JSONB de
  URLs de texto, sin storage propio, mismo alcance que `Remate.cover_image_url`) --
  brecha documentada y presentada al usuario antes de escribir código (instrucción
  explícita del enunciado: "documentarlo claramente antes de implementarlo").
- Único endpoint nuevo de todo este módulo: `POST /remates/{id}/lotes/{lote_id}/images`
  (multipart), valida Content-Type/tamaño, guarda a disco local
  (`MEDIA_ROOT/lotes/{lote_id}/...`, dentro del volumen ya montado por
  `docker-compose.yml`) y sirve vía `StaticFiles` (`/static`, mount nuevo en
  `app/main.py`). Devuelve solo la URL -- no toca la fila del lote.
- El array `images` se sigue persistiendo con el `PATCH .../lotes/{id}` ya existente
  desde la Épica 2.2 (`LoteUpdate.images`), sin ningún cambio -- subir un archivo y
  persistir el array son dos pasos deliberadamente separados (ver ADR-035, sección B),
  para poder subir varios archivos en paralelo y armar un único `PATCH` final sin riesgo
  de que dos actualizaciones concurrentes del mismo array JSONB se pisen entre sí.
- Galería "viva": cada acción (subir, eliminar, reordenar, marcar principal) persiste de
  inmediato con actualización optimista y revert-on-error, mismo patrón que el
  reordenamiento de lotes de la Épica 5.3 (ADR-034) -- sin un botón "Guardar" propio de
  la galería.
- Reordenamiento con HTML5 Drag and Drop nativo (sin librería nueva) + flechas ‹ › como
  fallback siempre visible, mismo criterio que ADR-034: HTML5 DnD no funciona en
  pantallas táctiles.
- Sin galería durante la creación de un lote (subir requiere un `lote_id` real que
  todavía no existe) -- el modal muestra un aviso y la galería completa aparece de
  inmediato al reabrir en modo edición, sin ningún paso de backend adicional.
- Dos componentes genéricos nuevos en `shared/components/` (`Dropzone`, `ProgressBar`),
  sin ningún conocimiento de imágenes ni de ningún dominio -- reutilizables tal cual el
  día que se agregue subida de video/PDF/certificados sobre `Lote.documents` (ya
  existente desde la Épica 2.2, sin consumidor todavía).
- Verificado de punta a punta contra el backend real en Docker Compose: subida de
  múltiples imágenes con progreso, selección de principal, reordenamiento por drag & drop
  y por flechas (persistido tras recargar la página), eliminación con confirmación, y
  rechazo de archivos con formato/tamaño inválido.
- Único módulo hasta ahora, desde la fundación del frontend (Épica 4.1), que agrega un
  endpoint nuevo al backend -- de forma puramente aditiva (ningún endpoint, schema ni
  comportamiento existente cambia) y documentada como tal antes de implementarse.

## Épica 6, Módulo 6.2 — notas de arquitectura del Sistema de Presencia

Detalle completo en
[docs/33-sistema-de-presencia.md](33-sistema-de-presencia.md) y
[ADR-036](adr/ADR-036-sistema-de-presencia.md). Resumen:

- Cierra un hueco documentado explícitamente desde el Módulo 3.4
  (`docs/21-sistema-de-salas.md`): presencia en tiempo real ("contadores visibles para
  otros usuarios, notificaciones de entrada/salida") quedaba pendiente. `docs/22` había
  incluso anticipado un sketch de implementación (publicar directamente desde
  `RoomManager.join`/`leave`) -- este módulo lo descarta a propósito (ver ADR-036,
  sección B) porque hubiera roto la firma de cero argumentos de `RoomManager`/
  `ConnectionManager` y los tests que ya los instancian así.
- `PresenceService` nuevo (`app/presence/`), paquete transversal que **compone**
  `RoomManager`/`ConnectionManager` (Módulos 3.3/3.4, sin modificarlos) y el `EventBus`
  (Módulo 3.2, sin modificarlo) -- mismo patrón arquitectónico que ya demostró
  `SnapshotService` (Módulo 3.6): infraestructura nueva que orquesta piezas existentes,
  en vez de extenderlas.
- Dos eventos nuevos (`PresenceUserConnected`/`PresenceUserDisconnected`,
  `event_type` `presencia.usuario_conectado`/`presencia.usuario_desconectado`, ya
  reservados desde Fase 0 en `docs/06-eventos-del-sistema.md`) se agregan a
  `SYNCED_EVENTS` (`app/realtime/registry.py`) -- única integración necesaria con el
  pipeline de sincronización en tiempo real; **cero cambios** en
  `EventDispatcher`/`EventConsumer` (Módulo 3.5).
- `RemateStateSnapshot` gana `connected_users_detail` (`app/snapshot/schemas.py`),
  enmascarado a `None` para no-privilegiados con el mismo mecanismo que ya usan
  `reserve_price`/`buyer_id` (ADR-026) -- el conteo (`connected_users: int`) sigue
  visible para cualquiera.
- `GET /presence/global` (`app/presence/router.py`) -- único endpoint HTTP nuevo de este
  módulo, cierra el capítulo "sin un endpoint HTTP todavía" que `ADR-024` (sección H)
  había dejado abierto para las métricas de `RoomManager`.
- Frontend: `PresenceCounter` (nuevo, `features/sala/components/`) reemplaza el
  `<span>` de conteo que `SalaHeader`/`ConsolaHeader` duplicaban, ahora en vivo evento a
  evento; `ConnectedUsersList` (nuevo, `features/rematador/components/`) solo se monta
  con `connected_users_detail` no nulo. El reducer (`features/sala/realtime/reducer.ts`,
  Épica 4.6, sin reestructurar) gana dos `case` más, indexados por `connection_id` (no
  por `user_id`, para no colapsar dos pestañas del mismo usuario).
- Cero cambios en el dominio (`app/modules/remates/`, `.../lotes/`,
  `app/modules/ofertas/`), el Auction Engine, la autenticación, `WebSocketClient`
  (`shared/websocket/client.ts`) ni `useLiveRemateState`.

## Épica 6, Módulo 6.4 — notas de arquitectura del Chat del Remate

Detalle completo en [docs/34-chat-del-remate.md](34-chat-del-remate.md) y
[ADR-037](adr/ADR-037-chat-del-remate.md). Resumen:

- Cierra la predicción explícita de `docs/22-sincronizacion-tiempo-real.md` (Módulo
  3.5): "se modela como un evento más (`ChatMessageSent`) publicado por un futuro
  módulo de dominio `chat`, sincronizado agregando su clase a `registry.py`" —
  confirmado literalmente, con una precisión: el chat sí necesitó persistencia
  (historial, moderación), así que se modeló como módulo de dominio propio
  (`app/modules/chat/`), no como infraestructura transversal (a diferencia de
  `presence`/`snapshot`) — mismo perfil que `Oferta`.
- `EventConsumer.dispatcher` (`app/realtime/consumer.py`) se generaliza de la clase
  concreta `EventDispatcher` a un `Protocol` estructural (`Dispatcher`) — cero cambio
  de comportamiento, ya funcionaba por duck typing — para admitir un **segundo**
  `EventConsumer` corriendo en paralelo al existente.
- `ChatSystemEventDispatcher` (`app/modules/chat/realtime.py`) es ese segundo
  consumidor: reacciona a una whitelist de 6 eventos de ciclo de vida
  (`remate.started/paused/resumed/finished`, `lote.opened/closed`) y genera mensajes
  de sistema, idempotentes vía `source_event_id` + índice único parcial
  (`uq_chat_messages_source_event_id`) — necesario para no duplicar mensajes en un
  despliegue con más de una instancia de backend, todas reaccionando al mismo
  `PUBLISH` de Redis. `RemateService`/`LoteService` no ganan ningún import ni
  dependencia nueva.
- Su `session_factory` se inyecta por constructor en vez de importar el singleton
  `AsyncSessionLocal` — necesario porque una tarea de fondo iniciada en el lifespan no
  pasa por el sistema de dependencias de FastAPI (a diferencia de `get_db`, ya
  sobreescrito por test). `app.state.db_session_factory` es el patrón nuevo que queda
  disponible para cualquier tarea de fondo futura equivalente.
- Historial paginado con keyset (`(created_at, id) < (:before_created_at, :before_id)`,
  comparación row-wise), no offset/limit como `OfertaRepository.list_by_lote` —
  desviación consciente para el escenario de scroll infinito hacia atrás con miles de
  mensajes.
- `author_name`/`author_role` denormalizados en `ChatMessage` al momento de enviar —
  evita un `JOIN` en la lectura más frecuente y preserva el nombre/rol que la persona
  tenía en ese momento; `author_role` es `String(20)` plano, no el ENUM nativo
  `user_role` (ADR-010), para no acoplar datos históricos a un catálogo que puede
  cambiar.
- Moderación (soft-delete) exclusiva del dueño del remate, sin excepción para admin —
  mismo criterio restrictivo que el resto de las acciones de escritura sobre un
  remate. Rate limiting básico (`RedisRateLimiter`, nuevo, infraestructura genérica
  sobre `INCR`+`EXPIRE`) en el servidor, no solo en el cliente.
- Envío/borrado/"está escribiendo" van por HTTP, nunca por el Gateway WebSocket —
  mismo criterio que `AuctionEngine.place_bid`, evita una tercera excepción a "el
  Gateway no conoce dominio" (las dos existentes son Snapshot y Presencia).
- Frontend: `subscribeToRealtime` (nuevo en `useLiveRemateState`,
  `features/sala/hooks.ts`) reenvía cualquier mensaje ya parseado del único
  `WebSocketClient` de la página a quien se suscriba — el feature `chat/` lo usa para
  no abrir una segunda conexión, lo que hubiera duplicado el conteo de
  `connected_users` de Presencia. `ChatPanel` se integra de forma aditiva en
  `SalaPage`/`ConsolaOperativaPage`, sin modificar ningún panel existente.
- Cero cambios en el Gateway WebSocket, `RoomManager`, `ConnectionManager`,
  `EventDispatcher`, `app/presence/`, `app/snapshot/` ni el dominio de
  remates/ofertas.
