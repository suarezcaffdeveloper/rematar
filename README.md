# RematAR

Plataforma de remates en vivo con ofertas en tiempo real. Ver [`docs/`](docs/) para el
diseño completo del sistema (visión, requisitos, arquitectura, ADRs) — este README cubre
solo cómo levantar y trabajar con lo que existe hoy.

**Estado del proyecto: Épica 3, Módulo 3.6 — Snapshot Service.** Ya están
implementados: la base técnica del backend (autenticación, usuarios, roles — Fase 1),
`Remate` (Épica 2.1), `Lote` (Épica 2.2), el motor de estados de ambos (Épica 2.3), el
Auction Engine — recepción, validación, aceptación/rechazo de ofertas (Épica 2.4) —,
Redis (Épica 3.1), el sistema interno de eventos (Event Bus sobre Redis Pub/Sub, el
dominio publica sin conocer quién consume — Épica 3.2), el Gateway WebSocket (conexión
autenticada con el mismo JWT de HTTP, heartbeat aplicativo — Épica 3.3), el sistema de
salas (cada remate es una sala independiente, `RoomManager` en memoria — Épica 3.4), el
Event Consumer (`app/realtime/`: escucha Redis Pub/Sub, entrega cada evento de dominio
únicamente a la sala del remate correspondiente — Épica 3.5) y ahora el Snapshot
Service (`app/snapshot/`): al entrar correctamente a una sala, el Gateway pide el
estado completo del remate (info, lote activo, oferta ganadora, historial reciente,
conectados) y se lo manda al cliente antes de que empiece a recibir eventos — RF-16
implementado por primera vez, reutilizable también por HTTP (Épica 3.6). Todavía no hay
chat, notificaciones push ni presencia online — la arquitectura ya los deja preparados
(ver
[Próximos pasos](#próximos-pasos)).

## Stack de esta fase

| Pieza | Tecnología | Por qué (detalle en [docs/12](docs/12-stack-tecnologico.md)) |
|---|---|---|
| API | FastAPI (async) | Concurrencia real de primera clase, tipado, docs automáticas |
| ORM | SQLAlchemy 2.0 (async, `asyncpg`) | Control transaccional explícito (`SELECT FOR UPDATE` en el Auction Engine, ver [ADR-004](docs/adr/ADR-004-concurrencia-en-determinacion-de-ganador.md)) |
| Migraciones | Alembic (async) | Esquema versionado, nunca editado a mano |
| Base de datos | PostgreSQL 16 | Fuente de verdad de negocio (ADR-002 de Fase 0) |
| Cache / Pub-Sub / Locks | Redis 7 (`redis-py` async) | Soporte de infraestructura, nunca fuente de verdad (ADR-002); cliente compartido vía `lifespan` (ver [ADR-021](docs/adr/ADR-021-integracion-de-redis.md)) |
| Eventos de dominio | Event Bus interno (`Protocol`) + Redis Pub/Sub | El dominio publica sin conocer consumidores; un canal por remate (ver [ADR-022](docs/adr/ADR-022-arquitectura-de-eventos.md)) |
| Tiempo real | WebSockets nativos de FastAPI/Starlette | Protocolo propio versionado, sin Socket.IO; heartbeat aplicativo y auth en el primer mensaje (ver [ADR-003](docs/adr/ADR-003-websockets-nativos-vs-socketio.md), [ADR-023](docs/adr/ADR-023-gateway-websocket.md)) |
| Salas | `RoomManager` en memoria, por instancia | Agrupa conexiones por remate, sin depender del dominio (ver [ADR-024](docs/adr/ADR-024-sistema-de-salas.md)) |
| Sincronización en tiempo real | `EventConsumer` + `EventDispatcher` (`app/realtime/`) | Único puente entre el Event Bus y el Gateway; el Auction Engine nunca sabe que existen WebSockets (ver [ADR-025](docs/adr/ADR-025-sincronizacion-tiempo-real.md)) |
| Snapshot Service | `SnapshotService` (`app/snapshot/`), caché corta en Redis | Reconstruye el estado completo de un remate al conectarse (RF-16/ADR-008), reutilizable por HTTP y WebSocket (ver [ADR-026](docs/adr/ADR-026-snapshot-service.md)) |
| Auth | JWT (PyJWT) + Argon2 (`argon2-cffi`) | Access token stateless + refresh token persistido y rotado (ver [ADR-011](docs/adr/ADR-011-refresh-tokens-persistidos-en-postgres.md)) |
| Logging | `structlog` | Logs estructurados con `request_id` de contexto (RNF-15) |
| Contenedores | Docker + Docker Compose | Entorno reproducible con un comando |

## Estructura del proyecto

```
RematAR/
├── docs/                          Documentación viva (Fase 0 en adelante)
│   ├── adr/                       Decisiones de arquitectura (ADR), una por archivo
│   └── *.md                       Visión, requisitos, roles, riesgos, glosario, etc.
├── backend/
│   ├── app/
│   │   ├── main.py                 Factory de la app FastAPI (middleware, exception handlers, routers)
│   │   ├── api/
│   │   │   └── router.py            Compone todos los routers de módulo bajo /api/v1
│   │   ├── core/                    Transversal a todos los módulos, sin lógica de negocio
│   │   │   ├── config.py             Settings centralizadas (pydantic-settings)
│   │   │   ├── logging.py            Configuración de structlog
│   │   │   ├── security.py           Hashing de contraseñas + codificación JWT genérica
│   │   │   ├── exceptions.py         Jerarquía de excepciones de dominio -> respuestas HTTP
│   │   │   └── middleware.py         Request ID + logging de cada request
│   │   ├── db/                      Infraestructura de acceso a datos, sin modelos de negocio
│   │   │   ├── base_class.py         Base declarativa de SQLAlchemy + naming convention
│   │   │   ├── base.py               Importa todos los modelos (para Alembic autogenerate)
│   │   │   ├── session.py            Engine async + dependencia get_db
│   │   │   └── mixins.py             UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin
│   │   ├── redis/                   Infraestructura de Redis, sin lógica de negocio (Épica 3.1)
│   │   │   ├── client.py             Construcción del cliente compartido (build_redis_client)
│   │   │   ├── dependencies.py        get_redis_client + una Depends() por capa
│   │   │   ├── cache.py, pubsub.py, streams.py, locks.py   Capas genéricas, ver docs/18
│   │   ├── events/                  Event Bus + base de eventos, sin conocer al dominio (Épica 3.2)
│   │   │   ├── base.py                DomainEvent, RemateScopedEvent (topic por remate)
│   │   │   ├── bus.py                 EventBus (Protocol) — el dominio depende de esto, no de Redis
│   │   │   ├── redis_bus.py            RedisEventBus: publish() best-effort sobre RedisPubSub
│   │   │   └── dependencies.py         get_event_bus, ver docs/19
│   │   ├── websocket/                Gateway WebSocket + salas, sin conocer al dominio (Épica 3.3, 3.4)
│   │   │   ├── router.py               Endpoint /ws + bucle de vida de la conexión (heartbeat, salas)
│   │   │   ├── auth.py                 authenticate_connection: primer mensaje, mismo JWT que HTTP
│   │   │   ├── manager.py              ConnectionContext + ConnectionManager (registro en memoria)
│   │   │   ├── rooms.py                RoomManager: agrupa conexiones por remate, ver docs/21
│   │   │   ├── messages.py, close_codes.py   Protocolo propio versionado, ver docs/20 y docs/21
│   │   │   └── dependencies.py         get_connection_manager, get_room_manager
│   │   ├── realtime/                 Event Consumer: único puente Event Bus <-> Gateway (Épica 3.5)
│   │   │   ├── consumer.py             EventConsumer: psubscribe("events.*"), reconexión con backoff
│   │   │   ├── dispatcher.py           EventDispatcher: interpreta, resuelve sala, entrega
│   │   │   ├── registry.py             Whitelist event_type -> clase Pydantic, ver docs/22
│   │   │   └── messages.py             DomainEventMessage (extiende WSMessage sin tocar websocket/)
│   │   ├── snapshot/                 Snapshot Service: estado completo reutilizable (Épica 3.6)
│   │   │   ├── service.py              SnapshotService.build() -- único método público
│   │   │   ├── schemas.py              RemateStateSnapshot, OfertaSnapshotEntry, ver docs/23
│   │   │   ├── dependencies.py         get_snapshot_service (funciona en HTTP y WebSocket)
│   │   │   ├── messages.py             SnapshotMessage (extiende WSMessage sin tocar websocket/)
│   │   │   └── router.py               GET /remates/{id}/snapshot -- demuestra la reutilización
│   │   ├── common/
│   │   │   └── schemas.py            Schemas genuinamente transversales (envelope de error, paginación)
│   │   ├── modules/                 Un paquete por dominio de negocio (crece en fases futuras)
│   │   │   ├── users/                Recurso User: modelo, repo, service, router
│   │   │   ├── auth/                 Sesión/credenciales: JWT, refresh tokens, RBAC, router
│   │   │   ├── remates/               Recurso Remate + motor de estados + events.py (catálogo propio)
│   │   │   │   └── lotes/              Recurso Lote (mismo bounded context que Remate), + su propio motor y events.py
│   │   │   └── ofertas/               Auction Engine: modelo Oferta, engine.py, repo, router, events.py
│   │   └── scripts/
│   │       └── create_superuser.py   Bootstrap del primer administrador (fuera de la API pública)
│   ├── alembic/                     Migraciones (env.py configurado para engine async)
│   ├── tests/                       pytest + pytest-asyncio + httpx, contra Postgres real
│   ├── Dockerfile
│   ├── docker-entrypoint.sh          Corre `alembic upgrade head` antes de levantar uvicorn
│   └── pyproject.toml                Único manifiesto de dependencias (PEP 621)
├── docker-compose.yml
├── .env.example
└── README.md                        Este archivo
```

### Por qué esta organización (no por capa técnica, por módulo de dominio)

`app/modules/<dominio>/` agrupa todo lo de ese dominio (modelo, repositorio, servicio,
schemas, router) en una misma carpeta, en vez de una estructura como `app/models/`,
`app/routers/`, `app/services/` con todos los dominios mezclados adentro. Con dos módulos
(`users`, `auth`) la diferencia todavía no se nota, pero esta fase es la base sobre la que
se agregan `remates`, `lotes`, `ofertas`, `notificaciones` en las próximas — con esos cinco
o seis módulos, una carpeta `app/services/` con diez archivos sin relación visual entre sí
sería mucho más difícil de navegar que `app/modules/remates/service.py`. Es también la
estructura que hace viable, si alguna vez hiciera falta, extraer un módulo a un servicio
separado (ver [ADR-001](docs/adr/ADR-001-modular-monolito-vs-microservicios.md) de Fase 0):
sus límites ya están en el filesystem, no hay que inventarlos en el momento.

Dentro de cada módulo, sí hay separación por capa (`models.py` → `repository.py` →
`service.py` → `router.py`), porque esa separación importa *dentro* de un dominio: el
router no debería saber de SQLAlchemy, y el repositorio no debería saber de reglas de
negocio. `core/`, `db/` y `common/` son las únicas carpetas transversales, y solo contienen
lo que de verdad no pertenece a ningún dominio específico.

### Por qué `auth` y `users` son módulos separados

`users` es dueño del recurso `User` (perfil, rol, estado). `auth` es dueño de la sesión
(tokens, refresh, RBAC) y usa a `users` para operar sobre ese recurso, nunca al revés. La
distinción importa porque `auth` va a seguir creciendo con conceptos que no son "usuario"
(en el futuro, quizás API keys, OAuth de terceros) sin que eso ensucie el módulo `users`.

### El módulo `remates`

Ver [docs/14-modulo-remate.md](docs/14-modulo-remate.md) para el diseño completo:
justificación campo por campo, qué es obligatorio u opcional, reglas de visibilidad y
permisos, y qué transiciones de estado están implementadas en esta fase (y cuáles se
diferieron a propósito porque dependen de que exista el módulo de Lotes). `remates` no
tiene ninguna relación SQLAlchemy con `users` — solo una FK simple (`owner_id`), para
mantener real el límite de módulo entre ambos.

## Dependencias principales

Ver [`backend/pyproject.toml`](backend/pyproject.toml) para la lista completa con
versiones. Justificación de cada una (incluyendo alternativas descartadas) en
[docs/12-stack-tecnologico.md](docs/12-stack-tecnologico.md) y en los docstrings de
`app/core/security.py` y `app/core/logging.py`.

## Instalación y uso

### Requisitos

- Docker y Docker Compose.
- Ningún requisito de Python en el host — todo corre en contenedores. (Python 3.13 local
  es necesario solo si vas a correr los tests fuera de Docker, ver más abajo.)

### 1. Configurar variables de entorno

```bash
cp .env.example .env
```

Completar al menos `SECRET_KEY` con un valor real:

```bash
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

> **Nota de puertos**: si en tu máquina ya corre otro Postgres en 5432 o 5433 (por otro
> proyecto), `docker-compose.yml` ya mapea el de RematAR a **5434** en el host para
> evitar el choque (esto se detectó en la práctica durante esta fase — ver
> [docs/09-arquitectura-y-decisiones.md](docs/09-arquitectura-y-decisiones.md)). Dentro
> de la red de Docker Compose el backend siempre se conecta a `db:5432`, ese mapeo solo
> afecta accesos desde el host. Mismo criterio para Redis: si ya corre otro en 6379, acá
> se mapea a **6380** (dentro de Docker Compose el backend siempre se conecta a
> `redis:6379`).

### 2. Levantar el stack

```bash
docker compose up -d
```

Esto levanta PostgreSQL y Redis, aplica las migraciones automáticamente
(`docker-entrypoint.sh` corre `alembic upgrade head` antes de iniciar la app) y expone:

- API: http://localhost:8000
- Documentación interactiva (Swagger UI): http://localhost:8000/api/v1/docs
- Documentación alternativa (ReDoc): http://localhost:8000/api/v1/redoc
- Adminer (UI de base de datos): http://localhost:8080 (sistema: PostgreSQL, servidor:
  `db`, usuario/clave/base según tu `.env`)

Verificar que Redis quedó bien integrado (Épica 3, Módulo 3.1 — ver
[docs/18-integracion-redis.md](docs/18-integracion-redis.md)):

```bash
curl http://localhost:8000/health
# {"status":"ok","checks":{"redis":"ok"}}
```

Si `checks.redis` da `"unavailable"`, revisá que el contenedor `redis` esté `healthy`
(`docker compose ps`) — la API sigue funcionando igual (Redis es soporte, nunca fuente
de verdad, ver [ADR-002](docs/adr/ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md)),
pero nada que dependa de Redis (a partir de la próxima épica, tiempo real) va a andar.

### 3. Crear el primer administrador

Los administradores no se crean por registro público (ver
[ADR-010](docs/adr/ADR-010-enum-nativo-de-roles-en-postgres.md)): se hace una vez con un
script de bootstrap, usando `FIRST_ADMIN_EMAIL`/`FIRST_ADMIN_PASSWORD` de tu `.env`.

```bash
docker compose exec backend python -m app.scripts.create_superuser
```

Es idempotente: si ya existe un usuario con ese email, no hace nada.

### 4. Probar el flujo (registro, login, roles)

```bash
# Registro (solo rol "rematador" o "comprador" — "admin" es rechazado con 422)
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"comprador1@test.com","password":"password123","full_name":"Comprador Uno","role":"comprador"}'

# Login (form-data, no JSON — así funciona el botón "Authorize" de Swagger UI)
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=comprador1@test.com&password=password123"

# Perfil propio, con el access_token de la respuesta anterior
curl http://localhost:8000/api/v1/users/me -H "Authorization: Bearer <ACCESS_TOKEN>"

# Como admin: listar usuarios (403 si lo intenta un comprador/rematador)
curl http://localhost:8000/api/v1/users -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

Los tres flujos (registro, login, RBAC por rol, refresh con rotación, logout con
revocación) fueron verificados manualmente contra este mismo stack durante esta fase, no
solo con tests — ver el detalle de qué se probó en
[docs/09-arquitectura-y-decisiones.md](docs/09-arquitectura-y-decisiones.md).

### 5. Probar remates (crear, programar, cancelar)

```bash
# Con el access_token de un usuario con role=rematador (paso 4)
curl -X POST http://localhost:8000/api/v1/remates \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"title":"Remate de hacienda","category":"hacienda","starts_at":"2027-03-01T14:00:00Z"}'

# Programar (DRAFT -> SCHEDULED); a partir de acá lo ven también los compradores
curl -X POST http://localhost:8000/api/v1/remates/<REMATE_ID>/schedule -H "Authorization: Bearer <ACCESS_TOKEN>"

# Cancelar (motivo obligatorio)
curl -X POST http://localhost:8000/api/v1/remates/<REMATE_ID>/cancel \
  -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
  -d '{"reason":"El lote se vendio por fuera de la plataforma."}'
```

Ver [docs/14-modulo-remate.md](docs/14-modulo-remate.md) para las reglas completas de
visibilidad (por qué un borrador ajeno da 404, no 403) y permisos por rol.

### Migraciones

```bash
# Generar una migración nueva después de cambiar un modelo
docker compose exec backend alembic revision --autogenerate -m "descripción del cambio"

# Aplicar migraciones pendientes (ya se corre solo al levantar el contenedor)
docker compose exec backend alembic upgrade head
```

### Tests

Los tests corren contra un PostgreSQL y un Redis reales (no SQLite, no mocks — ver el
docstring de `backend/tests/conftest.py`), en una base separada `rematar_test` y la DB 1
de Redis (aislada de la DB 0 de desarrollo), y se ejecutan desde el host (no dentro del
contenedor) para poder iterar rápido con un entorno local:

```bash
# Una sola vez: crear la base de test
docker compose exec db psql -U rematar -d rematar -c "CREATE DATABASE rematar_test;"

# Una sola vez: entorno virtual local con las dependencias (incluye las de dev)
cd backend
python -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"   # en Linux/Mac: .venv/bin/pip

# Requiere Postgres (5434) y Redis (6380) levantados: docker compose up -d db redis
# Correr la suite (usa los puertos mapeados por docker-compose.yml)
./.venv/Scripts/python -m pytest -v        # en Linux/Mac: .venv/bin/python
```

## Próximos pasos

Según [docs/13-mvp-y-roadmap.md](docs/13-mvp-y-roadmap.md) y
[docs/23-snapshot-service.md](docs/23-snapshot-service.md), lo que sigue (consumidores
nuevos sobre la misma arquitectura de snapshot + tiempo real ya construida):

- Presencia online: `RoomManager.connection_count(remate_id)` (Módulo 3.4) ya calcula el
  dato; falta publicarlo como evento (`presencia.usuario_conectado`,
  [06-eventos-del-sistema.md](docs/06-eventos-del-sistema.md)) desde
  `RoomManager.join`/`leave` y sincronizarlo con el `EventDispatcher` ya existente.
- Notificaciones dirigidas a un usuario (no a toda la sala), apoyadas en
  `ConnectionManager.connections_for_user(user_id)` (Módulo 3.3, ya existe).
- Chat por sala y rate limiting de ofertas, apoyados en las capas de Redis ya
  construidas.
- La transición `Oferta.ACCEPTED -> WINNING` al cerrar un lote vendido, con su propio
  evento, siguiendo el mismo patrón ya establecido.

## Documentación de referencia

- [`docs/README.md`](docs/README.md) — índice completo de la documentación de diseño.
- [`docs/09-arquitectura-y-decisiones.md`](docs/09-arquitectura-y-decisiones.md) —
  arquitectura general y registro de todos los ADR.
- [`docs/14-modulo-remate.md`](docs/14-modulo-remate.md) — diseño de la entidad Remate
  (Épica 2.1): campos, obligatoriedad, estados, permisos.
- [`docs/17-auction-engine.md`](docs/17-auction-engine.md) — diseño del Auction Engine
  (Épica 2.4): entidad Oferta, funcionamiento interno, concurrencia.
- [`docs/18-integracion-redis.md`](docs/18-integracion-redis.md) — integración de Redis
  (Épica 3.1): cliente compartido, health check, capas de infraestructura.
- [`docs/19-arquitectura-de-eventos.md`](docs/19-arquitectura-de-eventos.md) —
  arquitectura de eventos (Épica 3.2): catálogo, Event Bus, flujo de publicación.
- [`docs/20-gateway-websocket.md`](docs/20-gateway-websocket.md) — Gateway WebSocket
  (Épica 3.3): ciclo de vida de conexión, autenticación, heartbeat, `ConnectionManager`.
- [`docs/21-sistema-de-salas.md`](docs/21-sistema-de-salas.md) — Sistema de salas
  (Épica 3.4): `RoomManager`, ciclo de vida de una sala, múltiples conexiones por
  usuario, preparación para el Event Bus.
- [`docs/22-sincronizacion-tiempo-real.md`](docs/22-sincronizacion-tiempo-real.md) —
  sincronización en tiempo real (Épica 3.5): Event Consumer, Dispatcher, flujo
  completo oferta→cliente, cómo se garantiza el aislamiento por sala.
- [`docs/23-snapshot-service.md`](docs/23-snapshot-service.md) — Snapshot Service
  (Épica 3.6): reconstrucción de estado, reutilización por transporte, por qué hace
  falta snapshot + eventos, cómo escala a miles de conexiones concurrentes.
