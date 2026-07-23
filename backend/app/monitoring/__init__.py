"""Monitoring Service (Épica 8, Módulo 8.1). Ver
docs/38-observabilidad-y-monitoreo.md y ADR-041.

Top-level, transversal, mismo nivel que `app/analytics/`/`app/audit/`/`app/history/`:
no es un módulo de dominio, no tiene modelo de base de datos, no persiste nada propio.
Es la primera fase puramente de infraestructura/operabilidad del proyecto -- no agrega
ni modifica ninguna regla de negocio.

Dos superficies:

- **Health checks** (`GET /monitoring/health`, público): API/PostgreSQL/Redis/
  WebSocket, para probes de infraestructura sin credenciales.
- **Métricas** (`GET /monitoring/metrics`, admin-only): usuarios conectados,
  WebSockets activos, mensajes de chat y ofertas por minuto (consultas directas a
  Postgres, mismo criterio que `AnalyticsRepository`), tiempo promedio de
  procesamiento de una oferta y de respuesta de la API (`RedisMetricsRecorder`,
  `app/redis/metrics.py`, instrumentación additiva sin tocar la lógica medida), uso de
  memoria/CPU del proceso (`psutil`).

Preparado, no construido, para una integración futura con Prometheus/Grafana: este
módulo expone un contrato JSON limpio que un exportador futuro (`prometheus-client` +
`GET /metrics` en formato texto) consumiría sin tocar `MonitoringService` -- ver
ADR-041.
"""
