#!/usr/bin/env sh
# Se ejecuta al arrancar el contenedor, antes del comando principal (uvicorn en runtime
# normal, o cualquier otro comando que se le pase a `docker compose run backend ...`).
#
# Nota de producción: correr migraciones automáticamente en cada arranque de contenedor
# es razonable para una única instancia en desarrollo (este docker-compose), pero en un
# despliegue con múltiples réplicas del backend correrían todas la misma migración en
# paralelo. En ese escenario, la migración debería ser un paso de release separado
# (un job de un solo contenedor), no parte del arranque de cada réplica. Se documenta acá
# en vez de resolverlo ahora porque esta fase corre una sola instancia (ver
# docs/04-requisitos-no-funcionales.md, RNF-04/RNF-05 hablan de multi-instancia recién
# cuando entre el módulo de tiempo real).
set -e

echo "[entrypoint] Aplicando migraciones..."
alembic upgrade head

# El contenedor arranca como root (ver el `USER` que se sacó del Dockerfile, con su
# docstring) puntualmente para poder hacer esto: un volumen persistente montado en
# runtime (MEDIA_ROOT, ej. el Volume de Railway agregado para que las imágenes de
# remates/lotes sobrevivan a un redeploy) llega con SU PROPIO dueño -- típicamente
# root -- sin importar lo que la imagen haya dejado ahí en build time. Sin este
# `chown`, `appuser` (más abajo) no puede escribir una imagen nueva ahí --
# `PermissionError` sin manejar, que en el navegador se veía como un error de CORS
# (ver `_cors_headers_for_unhandled_error` en `app/core/exceptions.py`). Sin volumen
# montado (docker-compose local, o un backend sin este disco todavía) esto es un
# no-op inofensivo: crea/reafirma el dueño de una carpeta que igual iba a crear
# `create_app()` (`app/main.py`) al levantar.
MEDIA_DIR="/app/${MEDIA_ROOT:-media}"
mkdir -p "$MEDIA_DIR"
chown -R appuser:appuser "$MEDIA_DIR"

echo "[entrypoint] Iniciando aplicación..."
# Si el contenedor recibe un comando explícito (docker-compose local, o
# `docker compose run backend ...`), respetarlo tal cual. Si no (producción:
# Render, Railway, o cualquier PaaS que corra la imagen sin overridear CMD),
# arrancar uvicorn acá mismo -- la expansión de $PORT ocurre en este shell,
# no depende de cómo el Dockerfile escriba CMD ni de la sintaxis de
# interpolación de variables del dashboard de cada plataforma (Railway usa
# ${{VAR}}, no $VAR, en su campo de "Start Command", por ejemplo).
#
# UVICORN_HOST (default 0.0.0.0, IPv4-only): hipótesis sin probar documentada en
# docs/13-mvp-y-roadmap.md ("Deploy a producción — pendiente, bloqueado por un
# healthcheck que no pasa") -- tanto Render como Railway loguean 200 en /health
# exactamente en los timestamps de los intentos que después reportan como
# fallidos, en dos plataformas con proxy/healthcheck totalmente distintos. Si el
# healthchecker de alguna de las dos prueba por IPv6, un bind IPv4-only lo
# rechazaría a nivel de socket sin que la app se entere. Variable, no hardcodeo,
# para poder probar "::" (dual-stack) en Railway sin tocar Render ni el docker-
# compose local, que siguen con el default.
# `runuser -u appuser --`, no `su`: baja privilegios para el proceso de verdad
# expuesto a la red (Fase 10 de remediación del WebSocket Security Audit -- ver el
# docstring del Dockerfile) sin las complicaciones de `su` en un contenedor mínimo sin
# TTY/PAM completo (mensajes de warning, a veces falla directamente). Sin `-l`
# (login): preserva el entorno del proceso actual tal cual -- las variables que
# Railway/Render/docker-compose ya inyectaron (DATABASE_URL, REDIS_URL, PORT,
# SECRET_KEY, CORS_ORIGINS, etc.) tienen que seguir viéndose desde `appuser`.
if [ "$#" -gt 0 ]; then
    exec runuser -u appuser -- "$@"
else
    # --limit-concurrency: mismo criterio y mismo valor que docker-compose.yml (dev) --
    # ver el comentario ahí para el porqué del número.
    #
    # --workers: Épica 8, remediación de rendimiento (reconsideración de la Fase 14 del
    # plan de pruebas de carga) -- un solo proceso deja al backend 100% CPU-bound bajo
    # carga concurrente (confirmado: Postgres/Redis casi ociosos en la misma corrida,
    # ver docs/load-testing.md), sin usar más que un núcleo sin importar cuántos haya
    # disponibles. `--reload` (docker-compose.yml, desarrollo) es incompatible con
    # `--workers` > 1 -- por eso esto solo se activa acá, nunca en dev, donde de todos
    # modos no hace falta paralelismo real para iterar.
    #
    # Multi-worker degrada con gracia (no rompe) dos guardas que hoy son en memoria por
    # proceso, ya documentadas así antes de esta fase:
    # - `WS_MAX_CONNECTIONS_PER_USER` (app/websocket/rate_limit.py) pasa de un techo
    #   exacto a `WS_MAX_CONNECTIONS_PER_USER * cantidad_de_workers` -- sigue habiendo
    #   un techo finito, documentado explícitamente ahí como degradación aceptable.
    # - El contador de "conectados" que ve el usuario en la sala (`RoomManager.
    #   connection_count`, app/websocket/rooms.py) se subcuenta -- cada worker solo ve
    #   su propia porción de conexiones. Cosmético: no participa en absoluto de la
    #   determinación del ganador de un lote (eso corre enteramente por el lock de fila
    #   de Postgres + Redis Pub/Sub, ADR-004/ADR-022, verificado independiente del
    #   número de instancias en la Fase 6 del plan de pruebas de carga).
    # Corregir ambas con un registro distribuido en Redis queda como trabajo futuro
    # aparte (ver docs/load-testing.md), no un bloqueante para activar esto ahora.
    #
    # DB_POOL_SIZE/DB_MAX_OVERFLOW por worker -- HALLAZGO REAL de la reconsideración de
    # multi-worker (probado, no teórico): cada proceso de uvicorn crea su PROPIO engine
    # de SQLAlchemy (app/db/session.py, a nivel de módulo) con su propio pool -- los
    # defaults de Settings (20 + 30 = 50, pensados para UN proceso) multiplicados por
    # `--workers` pueden pedirle a Postgres muchas más conexiones que las que tiene
    # disponibles (`max_connections`, default 100) -- probando esto con 4 workers a los
    # defaults, Postgres devolvió "sorry, too many clients already" y **tumbó el acceso
    # a la base para todo el stack**, no solo para el proceso que lo causó. Presupuesto
    # deliberadamente conservador: (pool + overflow) × workers ≈ 68, deja ~30 conexiones
    # de margen sobre `max_connections=100` (herramientas de administración, conexiones
    # reservadas de Postgres, corridas de carga en paralelo). Si `UVICORN_WORKERS` se
    # cambia, estos dos valores TIENEN que recalcularse a mano -- no hay forma de
    # derivarlos automáticamente sin coordinación entre procesos, y un default
    # equivocado acá es exactamente el modo de falla que esto previene.
    : "${DB_POOL_SIZE:=7}"
    : "${DB_MAX_OVERFLOW:=10}"
    export DB_POOL_SIZE DB_MAX_OVERFLOW
    exec runuser -u appuser -- uvicorn app.main:app --host "${UVICORN_HOST:-0.0.0.0}" --port "${PORT:-10000}" --ws-max-size 65536 --limit-concurrency 2000 --workers "${UVICORN_WORKERS:-4}"
fi
