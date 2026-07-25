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

RUN pip install -e . \
    && chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
