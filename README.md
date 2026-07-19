# RematAR

Plataforma de remates en vivo con ofertas en tiempo real. Ver [`docs/`](docs/) para el
diseño completo del sistema (visión, requisitos, arquitectura, ADRs) — este README cubre
solo cómo levantar y trabajar con lo que existe hoy.

**Estado del proyecto: Épica 6, Módulo 6.1 — Gestión multimedia de los lotes.** La
Gestión de Remates y Lotes (Épica 5.3) ya cargaba un lote con una única imagen (URL de
texto); este módulo agrega una galería completa: subida de múltiples imágenes en
paralelo con barra de progreso, vista previa antes de terminar de subir, selección de
imagen principal, reordenamiento (drag & drop nativo + flechas de fallback) y
eliminación con confirmación. El backend no tenía ninguna capacidad de subida binaria —
se documentó esa brecha antes de implementar (instrucción explícita del enunciado) y se
agregó un único endpoint nuevo, `POST .../lotes/{id}/images` (multipart, disco local,
servido vía `StaticFiles`); el array de imágenes se sigue persistiendo con el `PATCH` de
Lote ya existente desde la Épica 2.2, sin cambios. Ver
[docs/32](docs/32-gestion-multimedia-lotes.md). Chat, streaming, notificaciones y
video/PDF/certificados de lote siguen siendo módulos futuros (ver
[Próximos pasos](#próximos-pasos)).

## Stack

### Backend

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
| Media (imágenes de lote) | Disco local + `StaticFiles` (FastAPI/Starlette) | Sin storage externo en esta fase; único endpoint nuevo del backend desde la fundación del frontend (ver [ADR-035](docs/adr/ADR-035-gestion-multimedia-lotes.md)) |
| Logging | `structlog` | Logs estructurados con `request_id` de contexto (RNF-15) |
| Contenedores | Docker + Docker Compose | Entorno reproducible con un comando |

### Frontend (Épica 4.1 + 4.3 + 4.4 + 4.5 + 4.6 + 5.1 + 5.2 + 5.3 + 6.1)

| Pieza | Tecnología | Por qué (detalle en [docs/24](docs/24-fundacion-frontend.md), [ADR-027](docs/adr/ADR-027-fundacion-frontend.md)) |
|---|---|---|
| UI | React + Vite + TypeScript | Ciclo de desarrollo rápido, ecosistema maduro para estado reactivo ante eventos por WebSocket (ver [docs/12](docs/12-stack-tecnologico.md)) |
| Ruteo | React Router v7 (`createBrowserRouter`) | API de datos, guards de autenticación/rol como rutas anidadas sin `path` propio |
| Estilos | Tailwind CSS v4 | Interfaz con mucho estado visual cambiante (ofertas, estados de lote) — se prefirió sobre CSS Modules, justificado en ADR-027 sección C |
| Estado global | Zustand | Suscripción por selector, no por subárbol como `Context.Provider` — pensado para el estado de tiempo real que viene después (ADR-027 sección D) |
| HTTP | Axios, cliente centralizado con interceptores | JWT automático + refresh transparente con cola single-flight (ADR-027 secciones E-G) |
| Tiempo real | WebSocket nativo del navegador, cliente propio (`shared/websocket/client.ts`) | Mismo criterio que el backend (ADR-003: nativo, sin Socket.IO); auth en el primer mensaje, heartbeat, reconexión con backoff exponencial, reutilizable por cualquier feature futura (ver [docs/28](docs/28-websocket-tiempo-real-sala.md), [ADR-031](docs/adr/ADR-031-websocket-tiempo-real-sala.md)) |
| Tests | Vitest + Testing Library | Mismo motor que Vite, sin configuración aparte |
| Contenedores | Docker (dev-only, ver Dockerfile) | Mismo criterio que el backend: `docker compose up` levanta todo |

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
├── frontend/                        Épica 4 -- React + Vite + TypeScript, ver docs/24
│   ├── src/
│   │   ├── main.tsx / App.tsx        Entry point + <RouterProvider>
│   │   ├── app/                       Ensamblaje: router, los 3 layouts, páginas sin dominio propio
│   │   │   ├── router.tsx              Árbol de rutas (createBrowserRouter), guards anidados
│   │   │   ├── layouts/                RootLayout, AuthLayout, AppLayout
│   │   │   └── pages/                  HomePage (rama por rol -> dashboard real si comprador), 403, 404, admin de ejemplo
│   │   ├── features/                  Un paquete por dominio de negocio (mismo criterio que app/modules/)
│   │   │   ├── auth/                   api.ts, store.ts (Zustand+persist), hooks.ts, types.ts, pages/
│   │   │   ├── remates/                Dashboard comprador (4.3) + detalle (4.4): api.ts (+ start/resume/finish, 5.1), filtering.ts, hooks.ts, components/, pages/
│   │   │   ├── sala/                    Sala del remate (4.5) + tiempo real (4.6): api.ts, hooks.ts, realtime/ (events.ts, messages.ts, reducer.ts), components/, pages/
│   │   │   └── rematador/               Dashboard (5.1) + Consola Operativa (5.2) + Gestión de Remates/Lotes (5.3) + Galería multimedia (6.1): remateForm.ts, loteForm.ts, duplication.ts, media.ts, hooks.ts, components/, pages/
│   │   ├── shared/                    Transversal, sin conocer ningún dominio
│   │   │   ├── api/                    client.ts (Axios + interceptores), errors.ts, types.ts
│   │   │   ├── components/             Button, Input, Textarea, Select, Spinner, Alert, Card, Badge, Skeleton, EmptyState, Breadcrumb, Modal, ConfirmModal, DropdownMenu, Dropzone, ProgressBar
│   │   │   ├── guards/                 RequireAuth, RequireRole
│   │   │   ├── lib/                    format.ts -- formatDateTime, formatCurrency (Intl nativo)
│   │   │   ├── config/                 env.ts -- wrapper tipado de import.meta.env (+ wsBaseUrl derivado, Épica 4.6)
│   │   │   ├── websocket/              client.ts -- WebSocketClient reutilizable (auth, heartbeat, reconexión, salas), sin conocer dominio (Épica 4.6)
│   │   │   └── toast/                  Manejo global de avisos/errores (Zustand)
│   │   └── test/                      Setup de Vitest
│   ├── Dockerfile                    Dev-only, ver docs/24
│   └── package.json
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

### El frontend: la misma disciplina de límites, del otro lado

`frontend/src/features/<dominio>/` es, a propósito, el mismo criterio que
`backend/app/modules/<dominio>/`: todo lo de un dominio (llamadas HTTP, estado, tipos,
páginas) en una carpeta, no repartido en `pages/`, `hooks/`, `stores/` con todos los
dominios mezclados. `frontend/src/shared/` cumple el rol de `app/core/`+`app/common/`
del backend — transversal, sin conocer ningún dominio. Detalle completo, incluida la
justificación de Tailwind sobre CSS Modules y Zustand sobre Context API, en
[docs/24-fundacion-frontend.md](docs/24-fundacion-frontend.md) y
[ADR-027](docs/adr/ADR-027-fundacion-frontend.md).

## Dependencias principales

Ver [`backend/pyproject.toml`](backend/pyproject.toml) para la lista completa con
versiones. Justificación de cada una (incluyendo alternativas descartadas) en
[docs/12-stack-tecnologico.md](docs/12-stack-tecnologico.md) y en los docstrings de
`app/core/security.py` y `app/core/logging.py`.

## Instalación y uso

### Requisitos

- Docker y Docker Compose.
- Ningún requisito de Python ni Node en el host — todo corre en contenedores. (Python
  3.13 y Node 24 locales son necesarios solo si vas a correr los tests fuera de Docker,
  ver más abajo.)

### 1. Configurar variables de entorno

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

El `.env` de la raíz es del backend (`SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, CORS,
etc.); `frontend/.env` es del frontend (`VITE_API_BASE_URL`, ver
[docs/24-fundacion-frontend.md](docs/24-fundacion-frontend.md)) — Vite lee variables de
entorno desde su propia carpeta, no desde la raíz del repo.

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

Esto levanta PostgreSQL, Redis y el backend (aplicando migraciones automáticamente --
`docker-entrypoint.sh` corre `alembic upgrade head` antes de iniciar la app) y también
el frontend (Vite en modo dev, con hot reload vía el volumen montado). Expone:

- Frontend: http://localhost:5173
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
pero todo lo de tiempo real (Event Bus, Gateway WebSocket, salas, Event Consumer,
Snapshot Service — Épica 3, ya implementados) va a fallar.

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

### Frontend: desarrollo y tests

Para trabajar en el frontend con recarga instantánea sin pasar por el volumen de
Docker (más rápido para iterar), corré Vite directo en el host -- necesita el backend
levantado (`docker compose up -d db redis backend`) para que las llamadas a la API
tengan a quién pegarle:

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, con hot reload
```

Tests (Vitest + Testing Library, sin necesidad de backend ni Docker -- todo el estado
externo se mockea):

```bash
cd frontend
npm run test          # una corrida
npm run test:watch    # modo watch
```

Typecheck y lint:

```bash
npx tsc -b            # o: npm run build, que además genera frontend/dist/
npm run lint           # oxlint
```

## Próximos pasos

**Frontend** (según [docs/32-gestion-multimedia-lotes.md](docs/32-gestion-multimedia-lotes.md),
sobre lo agregado en este módulo, sin tocar nada de lo ya construido):

- Subida de video, PDF, certificados sanitarios y archivos técnicos sobre
  `Lote.documents` (ya existente desde la Épica 2.2, sin consumidor todavía) -- mismo
  patrón subida+`PATCH` que este módulo, sin rediseñar (ver ADR-035).
- Storage externo (S3/Cloudinary) para las imágenes de lote, si el volumen lo
  justificara (hoy, disco local -- ver ADR-035).
- Limpieza de archivos huérfanos en disco (subidos pero nunca persistidos en ningún
  lote, ver ADR-035, "Consecuencias").
- Subida real de portada de remate (`Remate.cover_image_url`, hoy sigue siendo URL de
  texto -- este módulo solo resolvió imágenes de lote).
- Un endpoint de duplicación real en el backend, si el volumen de lotes por remate lo
  justificara (hoy se compone en el cliente con GET + POST secuencial, ver ADR-034).
- "Cancelar lote" desde la Consola Operativa (`POST .../cancel`, ya expuesto por el
  backend, sin consumidor en el frontend todavía) -- "Cancelar remate" ya se consume
  desde este módulo (Épica 5.3).
- Formulario real de "Realizar oferta" en la Sala del Remate (`PlaceBidButton` ya
  aislado para esto) -- podría además usar `oferta.rejected` (ya tipado, hoy descartado
  deliberadamente porque nadie puede ser su emisor todavía) para notificar al propio
  usuario que ofertó.
- Chat por sala, presencia detallada (quién específicamente está conectado, no solo un
  número), video y streaming -- todos construibles sobre `shared/websocket/client.ts`
  sin modificarlo (ver [docs/28](docs/28-websocket-tiempo-real-sala.md), "Preparado
  para Chat/Presencia/Notificaciones/Streaming").
- Presencia en tiempo real de `connected_users` (hoy solo se actualiza en cada
  reconexión/recarga, no evento a evento -- requiere que el backend publique
  `presencia.usuario_conectado`/`desconectado`, ver "Backend" abajo).
- Dashboard propio para `admin` — sigue viendo el placeholder de la Módulo 4.1.

**Backend** (según [docs/13-mvp-y-roadmap.md](docs/13-mvp-y-roadmap.md) y
[docs/23-snapshot-service.md](docs/23-snapshot-service.md), consumidores nuevos sobre
la arquitectura de snapshot + tiempo real ya construida):

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
- [`docs/24-fundacion-frontend.md`](docs/24-fundacion-frontend.md) — Fundación del
  frontend (Épica 4.1): árbol completo, flujo de autenticación, manejo de rutas,
  cómo esta base permite construir el resto de las pantallas.
- [`docs/25-dashboard-comprador.md`](docs/25-dashboard-comprador.md) — Dashboard del
  comprador (Épica 4.3): flujo de datos, consumo de la API existente, estructura de
  componentes reutilizables, limitaciones conocidas (sin búsqueda server-side, N+1
  acotado para lote count, sin nombre de rematador).
- [`docs/26-detalle-remate.md`](docs/26-detalle-remate.md) — Página de detalle del
  remate (Épica 4.4): flujo de datos con dos hooks de carga independientes, listado de
  lotes, componentes reutilizables, preparación para integrarse con la sala del remate
  en vivo.
- [`docs/27-sala-del-remate.md`](docs/27-sala-del-remate.md) — Sala del remate,
  versión inicial (Épica 4.5): flujo Snapshot → Render, estructura de componentes,
  optimización de renderizado, preparación para recibir eventos WebSocket sin
  reestructurar código.
- [`docs/28-websocket-tiempo-real-sala.md`](docs/28-websocket-tiempo-real-sala.md) —
  Integración WebSocket y tiempo real (Épica 4.6): servicio WebSocket reutilizable,
  flujo Snapshot → WebSocket → Eventos, manejo de los 12 eventos de dominio
  sincronizados, indicadores visuales de conexión, preparación para Chat/Presencia/
  Notificaciones/Streaming sin modificar el servicio WebSocket.
- [`docs/29-dashboard-rematador.md`](docs/29-dashboard-rematador.md) — Dashboard del
  Rematador (Épica 5.1): flujo de datos, componentes reutilizables (extensión aditiva
  de `features/remates/`), acciones de ciclo de vida (iniciar/reanudar/finalizar),
  preparación para la Consola Operativa del Rematador.
- [`docs/30-consola-operativa-rematador.md`](docs/30-consola-operativa-rematador.md) —
  Consola Operativa del Rematador (Épica 5.2): diagrama de la consola, flujo de cada
  acción del panel de control, integración con WebSockets (reutilización de
  `useLiveRemateState` sin modificarlo), preparación para la gestión completa de
  remates y lotes.
- [`docs/31-gestion-remates-lotes.md`](docs/31-gestion-remates-lotes.md) — Gestión
  completa de Remates y Lotes (Épica 5.3): flujo de creación/edición, reordenamiento
  con drag & drop, componentes reutilizables nuevos, checklist completo del módulo.
- [`docs/32-gestion-multimedia-lotes.md`](docs/32-gestion-multimedia-lotes.md) — Gestión
  multimedia de los lotes (Épica 6.1): brecha de backend documentada antes de
  implementar, endpoint nuevo de subida a disco local, flujo de carga de archivos,
  estructura de componentes, preparación para video/PDF/certificados sin rediseñar.
