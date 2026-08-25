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
    exec runuser -u appuser -- uvicorn app.main:app --host "${UVICORN_HOST:-0.0.0.0}" --port "${PORT:-10000}" --ws-max-size 65536
fi
