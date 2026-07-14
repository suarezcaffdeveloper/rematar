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
exec "$@"
