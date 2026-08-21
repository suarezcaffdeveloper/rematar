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

echo "[entrypoint] Iniciando aplicación..."
# Si el contenedor recibe un comando explícito (docker-compose local, o
# `docker compose run backend ...`), respetarlo tal cual. Si no (producción:
# Render, Railway, o cualquier PaaS que corra la imagen sin overridear CMD),
# arrancar uvicorn acá mismo -- la expansión de $PORT ocurre en este shell,
# no depende de cómo el Dockerfile escriba CMD ni de la sintaxis de
# interpolación de variables del dashboard de cada plataforma (Railway usa
# ${{VAR}}, no $VAR, en su campo de "Start Command", por ejemplo).
if [ "$#" -gt 0 ]; then
    exec "$@"
else
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-10000}" --ws-max-size 65536
fi
