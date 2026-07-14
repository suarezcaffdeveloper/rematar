# RematAR

Plataforma de remates en vivo con ofertas en tiempo real. Ver [`docs/`](docs/) para el
diseño completo del sistema (visión, requisitos, arquitectura, ADRs) — este README cubre
solo cómo levantar y trabajar con lo que existe hoy.

**Estado del proyecto: Épica 2, Módulo 2.1 — Modelo de Remate.** Ya están implementados:
la base técnica del backend (autenticación, usuarios, roles, infraestructura — Fase 1) y
la entidad `Remate` completa (CRUD, permisos, ciclo de vida) sin relación con lotes
todavía. Todavía no hay Lotes, Ofertas, WebSockets ni Redis — eso sigue en las próximas
épicas (ver [Próximos pasos](#próximos-pasos)).

## Stack de esta fase

| Pieza | Tecnología | Por qué (detalle en [docs/12](docs/12-stack-tecnologico.md)) |
|---|---|---|
| API | FastAPI (async) | Concurrencia real de primera clase, tipado, docs automáticas |
| ORM | SQLAlchemy 2.0 (async, `asyncpg`) | Control transaccional explícito (necesario para el locking de ofertas en fases futuras) |
| Migraciones | Alembic (async) | Esquema versionado, nunca editado a mano |
| Base de datos | PostgreSQL 16 | Fuente de verdad de negocio (ADR-002 de Fase 0) |
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
│   │   │   └── mixins.py             UUIDPrimaryKeyMixin, TimestampMixin
│   │   ├── common/
│   │   │   └── schemas.py            Schemas genuinamente transversales (envelope de error, paginación)
│   │   ├── modules/                 Un paquete por dominio de negocio (crece en fases futuras)
│   │   │   ├── users/                Recurso User: modelo, repo, service, router
│   │   │   ├── auth/                 Sesión/credenciales: JWT, refresh tokens, RBAC, router
│   │   │   └── remates/              Recurso Remate: modelo, state_machine, repo, service, router
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
> afecta accesos desde el host.

### 2. Levantar el stack

```bash
docker compose up -d
```

Esto levanta PostgreSQL, aplica las migraciones automáticamente (`docker-entrypoint.sh`
corre `alembic upgrade head` antes de iniciar la app) y expone:

- API: http://localhost:8000
- Documentación interactiva (Swagger UI): http://localhost:8000/api/v1/docs
- Documentación alternativa (ReDoc): http://localhost:8000/api/v1/redoc
- Adminer (UI de base de datos): http://localhost:8080 (sistema: PostgreSQL, servidor:
  `db`, usuario/clave/base según tu `.env`)

Verificar que levantó bien:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

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

Los tests corren contra una base PostgreSQL real (no SQLite, no mocks — ver el docstring
de `backend/tests/conftest.py`), en una base separada `rematar_test`, y se ejecutan desde
el host (no dentro del contenedor) para poder iterar rápido con un entorno local:

```bash
# Una sola vez: crear la base de test
docker compose exec db psql -U rematar -d rematar -c "CREATE DATABASE rematar_test;"

# Una sola vez: entorno virtual local con las dependencias (incluye las de dev)
cd backend
python -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"   # en Linux/Mac: .venv/bin/pip

# Correr la suite (usa localhost:5434, el puerto mapeado por docker-compose.yml)
./.venv/Scripts/python -m pytest -v        # en Linux/Mac: .venv/bin/python
```

## Próximos pasos

Según [docs/13-mvp-y-roadmap.md](docs/13-mvp-y-roadmap.md) y
[docs/14-modulo-remate.md](docs/14-modulo-remate.md), lo que sigue:

- **Módulo 2.2 — Lotes**: modelo y máquina de estado de `Lote` (`PENDING` → `OPEN` →
  `CLOSED_SOLD`/`CLOSED_UNSOLD`, ver [docs/07](docs/07-maquinas-de-estado.md)), relación
  `Lote.remate_id`, con la restricción de que solo un lote por remate puede estar `OPEN`
  a la vez (RF-12).
- Recién ahí, agregar a `Remate` las transiciones que hoy quedaron deliberadamente afuera
  (`start` -> LIVE, `pause`/`resume` <-> PAUSED, `finish` -> FINISHED), ahora que se puede
  validar la precondición de RF-08 ("al menos un lote cargado").
- Todavía **sin** WebSockets, Redis ni lógica de ofertas en el Módulo 2.2 — eso llega
  recién cuando el ciclo de vida de remates/lotes esté sólido, siguiendo el orden que ya
  documentamos en la Fase 0.

## Documentación de referencia

- [`docs/README.md`](docs/README.md) — índice completo de la documentación de diseño.
- [`docs/09-arquitectura-y-decisiones.md`](docs/09-arquitectura-y-decisiones.md) —
  arquitectura general y registro de todos los ADR.
- [`docs/14-modulo-remate.md`](docs/14-modulo-remate.md) — diseño de la entidad Remate
  (Épica 2.1): campos, obligatoriedad, estados, permisos.
