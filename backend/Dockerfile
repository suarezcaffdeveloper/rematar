# Imagen única para desarrollo (ver docker-compose.yml en la raíz del proyecto).
#
# Nota de producción: esta imagen instala el paquete en modo editable (`pip install -e .`)
# a propósito, para que el volumen montado en docker-compose.yml (./backend:/app) permita
# recarga en caliente (`--reload`) sin reconstruir la imagen en cada cambio. Una imagen de
# producción real no montaría un volumen ni usaría instalación editable ni `--reload`:
# copiaría el código una vez, lo instalaría de forma normal y correría con un proceso
# gestionado (ej. uvicorn con múltiples workers, o gunicorn+uvicorn). Ese Dockerfile de
# producción es un ítem de roadmap explícito (ver docs/13-mvp-y-roadmap.md), no algo que
# esta fase necesite resolver todavía.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY . .

# Fase 10 de remediación del WebSocket Security Audit (SAST/semgrep): la imagen corría
# el proceso como root por default -- si un atacante lograra ejecución de código dentro
# del contenedor (ej. vía una dependencia comprometida), tendría privilegios de root
# dentro de él. `appuser` no tiene privilegios especiales; `chown` cubre /app porque
# MEDIA_ROOT ("media", ver app/core/config.py) escribe imágenes de lote ahí en runtime.
RUN pip install -e . \
    && chmod +x docker-entrypoint.sh \
    && useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app

EXPOSE 10000

# Sin `USER appuser` acá a propósito (a diferencia de antes): un volumen persistente
# montado en runtime (ej. el Volume de Railway en MEDIA_ROOT, agregado para que las
# imágenes de remates/lotes sobrevivan a un redeploy) llega con SU PROPIO dueño --
# típicamente root -- que pisa por completo cualquier `chown` hecho en esta imagen en
# build time, sin importar lo que diga acá. Si el contenedor arrancara ya como
# `appuser` (este `USER` de antes), jamás podría escribir ahí -- exactamente el bug que
# rompió la carga de imágenes de lote después de crear el volumen (`PermissionError`
# sin manejar, ver el docstring de `_cors_headers_for_unhandled_error` en
# `app/core/exceptions.py` para por qué eso encima se veía como un error de CORS en el
# navegador). La solución movió el drop de privilegios a `docker-entrypoint.sh`, que
# ahora arranca como root -- necesario para poder `chown` el volumen recién montado
# después de que Railway/Render lo pisan -- y recién ahí baja a `appuser` con
# `runuser` para el proceso de verdad expuesto a la red (uvicorn).

ENTRYPOINT ["./docker-entrypoint.sh"]
# Sin CMD a propósito: docker-entrypoint.sh arranca uvicorn él mismo cuando no
# recibe argumentos (producción -- Render, Railway, cualquier PaaS que corra
# la imagen sin overridear el comando), resolviendo $PORT con `${PORT:-10000}`
# en su propio shell. Antes esto vivía acá como `CMD exec uvicorn ... --port
# ${PORT:-10000} ...` en forma shell: funcionaba porque Docker envuelve un CMD
# en forma shell como `/bin/sh -c "..."` y se lo pasa como argumento al
# ENTRYPOINT (que a su vez hace `exec "$@"`) -- pero ese doble salto (Dockerfile
# CMD -> shell intermedio -> entrypoint) es frágil: cualquier PaaS que
# overridee el comando del contenedor con su propia sintaxis de variables
# (Railway interpola ${{VAR}} en su campo de "Start Command", no $VAR) rompe
# la expansión en runtime. Resolver $PORT directamente en docker-entrypoint.sh
# elimina esa dependencia por completo. docker-compose.yml sigue pasando su
# propio `command:` en dev (puerto 8000, --reload), que el entrypoint respeta
# tal cual.
#
# --ws-max-size: defensa en profundidad de tamaño de frame (Fase 4 de remediación del
# WebSocket Security Audit, ver app/websocket/rate_limit.py) -- rechaza un frame
# demasiado grande a nivel de transporte, antes de que la app llegue a bufferearlo
# entero en memoria. El chequeo real (el único que corre en tests, que no pasan por
# uvicorn) es el de la app, WS_MAX_MESSAGE_BYTES; este es un techo más generoso y
# puramente de contención.
