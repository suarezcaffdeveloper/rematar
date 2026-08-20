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

USER appuser

EXPOSE 10000

ENTRYPOINT ["./docker-entrypoint.sh"]
# --ws-max-size: defensa en profundidad de tamaño de frame (Fase 4 de remediación del
# WebSocket Security Audit, ver app/websocket/rate_limit.py) -- rechaza un frame
# demasiado grande a nivel de transporte, antes de que la app llegue a bufferearlo
# entero en memoria. El chequeo real (el único que corre en tests, que no pasan por
# uvicorn) es el de la app, WS_MAX_MESSAGE_BYTES; este es un techo más generoso y
# puramente de contención.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "10000", "--ws-max-size", "65536"]
