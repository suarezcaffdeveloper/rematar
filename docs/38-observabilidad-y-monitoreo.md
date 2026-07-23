# 38 — Observabilidad y Monitoreo (Épica 8, Módulo 8.1)

Este documento es la referencia de diseño del Monitoring Service: qué chequea cada
health check, de dónde sale cada métrica, qué cambió en el logging y qué queda
preparado (no construido) para una integración futura con Prometheus/Grafana. A
diferencia de todas las épicas anteriores, este módulo es puramente de
infraestructura/operabilidad -- no agrega ni modifica ninguna regla de negocio. Ver
[ADR-041](adr/ADR-041-observabilidad-y-monitoreo.md) para el razonamiento completo de
las decisiones tomadas acá.

## Alcance de este módulo

- **Health checks** de API, PostgreSQL, Redis y el Gateway WebSocket, en un endpoint
  público nuevo (`GET /monitoring/health`) -- distinto del `/health` ya existente
  (`app/main.py`, sin tocar), que se deja intacto por si algo externo ya depende de su
  forma actual.
- **Métricas** de la plataforma completa (`GET /monitoring/metrics`, admin-only):
  usuarios conectados, WebSockets activos, mensajes de chat por minuto, ofertas por
  minuto, tiempo promedio de procesamiento de una oferta, tiempo de respuesta de la
  API, errores recientes, uso de memoria y CPU del proceso.
- **Logging mejorado**: cuatro logs nuevos de ciclo de vida del proceso
  (`app_starting`/`app_started`/`app_shutting_down`/`app_stopped`) -- el resto de los
  requisitos (errores inesperados, advertencias, logs estructurados) ya estaban
  cubiertos desde fases anteriores, documentado más abajo.
- **Panel de administrador**: tercera pestaña "Monitoreo" en `/admin` (junto a
  Auditoría y Historial), con tarjetas KPI y actualización automática cada 10s.
- Un Monitoring Service desacoplado (`app/monitoring/`), preparado -- no construido --
  para exportar estas mismas métricas a Prometheus/Grafana a futuro.

**No se implementa**: la integración real con Prometheus/Grafana (sin
`prometheus-client`, sin endpoint `/metrics` en formato texto); alertas configurables;
dashboards externos. Ver la sección dedicada más abajo.

## Dónde vive el código

`app/monitoring/` -- paquete transversal nuevo, top-level, mismo nivel que
`app/analytics/`/`app/audit/`/`app/history/`: sin modelo de base de datos propio, sin
migración.

| Archivo | Responsabilidad |
|---|---|
| `schemas.py` | `HealthCheckResult`/`HealthCheckResponse`/`PlatformMetrics`. |
| `repository.py` | `MonitoringRepository` -- dos consultas nuevas, **globales** (mensajes de chat y ofertas por minuto, toda la plataforma, no un remate puntual). |
| `service.py` | `MonitoringService` -- health checks + agregación de métricas. |
| `dependencies.py` | `get_monitoring_repository`, `get_monitoring_service`. |
| `router.py` | `GET /monitoring/health` (público), `GET /monitoring/metrics` (admin). |

**Archivos existentes tocados**, todos additivos (ninguna regla de negocio cambiada):

- `app/redis/metrics.py` (nuevo): `RedisMetricsRecorder`, capa de infraestructura
  genérica -- mismo patrón que `RedisCache`/`RedisRateLimiter`. `app/redis/dependencies.py`
  gana `get_metrics_recorder`.
- `app/core/middleware.py` (`RequestContextMiddleware`): una línea additiva,
  best-effort, que registra `duration_ms` (ya calculado, ya logueado) en
  `RedisMetricsRecorder`.
- `app/modules/ofertas/router.py` (`place_bid`): envuelve la llamada ya existente a
  `engine.place_bid(...)` con un timer -- **`AuctionEngine` no se modifica**.
- `app/core/exceptions.py` (`handle_unexpected_error`): una línea additiva que
  incrementa un contador de errores -- el logging/manejo de errores ya existente no
  cambia.
- `app/main.py` (`_lifespan`): cuatro logs de ciclo de vida nuevos.
- `app/api/router.py`: `include_router(monitoring_router)`.
- `pyproject.toml`: dependencia nueva `psutil` (memoria/CPU del proceso,
  multiplataforma).

**Cero cambios** en `AuctionEngine`, `RemateService`, `LoteService`, `ChatService`,
`AuthService`, ni ninguna validación/regla de negocio existente.

## Health Checks

`GET /monitoring/health` -- **público**, sin autenticación (las herramientas de
infraestructura -- load balancer, probes de orquestación, uptime monitors -- no tienen
credenciales de la aplicación). Cuatro componentes, cada uno con su propio chequeo
best-effort (una falla en un chequeo nunca tumba el endpoint entero):

| Componente | Chequeo | Detalle |
|---|---|---|
| `api` | Si este handler se ejecuta, la API está respondiendo. | Siempre `"ok"`. |
| `postgres` | `SELECT 1` sobre la sesión de base ya inyectada por request. | `"unavailable"` + detalle del error si falla. |
| `redis` | `PING` sobre el cliente compartido -- mismo chequeo que ya hacía `/health`. | `"unavailable"` + detalle si falla. |
| `websocket` | `ConnectionManager` del proceso inicializado (siempre lo está tras el `lifespan`). | Reporta la cantidad de conexiones activas como **contexto informativo**, nunca como condición de fallo -- cero conexiones es un estado válido, no una caída (no existe un "ping" real de un gateway completo). |

`status` general es `"ok"` únicamente si los cuatro componentes están `"ok"`; cualquier
componente degradado baja el estado general a `"degraded"`. Un chequeo caído además se
loguea (`logger.error("health_check_failed", component=...)`) -- eventos críticos,
pedido explícito de logging del módulo.

## De dónde sale cada métrica

| Métrica | Origen |
|---|---|
| Usuarios conectados | `ConnectionManager.list_connections()` -- usuarios **distintos** (`{c.user_id for c in ...}`), no conexiones. |
| WebSockets activos | Misma lista, sin deduplicar -- conexiones totales (un usuario con dos pestañas cuenta dos veces, mismo criterio que `PresenceGlobalStats.total_connections`, Módulo 6.2). |
| Mensajes de chat / minuto | `MonitoringRepository.count_chat_messages_since` -- `COUNT(*)` sobre `ChatMessage` (`kind=user`) global, `created_at >= now() - 60s`. |
| Ofertas / minuto | `MonitoringRepository.count_ofertas_since` -- mismo criterio, sobre `Oferta`, global. |
| Tiempo promedio de una oferta | `RedisMetricsRecorder.get_average_ms("oferta_processing")` -- instrumentado envolviendo la llamada a `AuctionEngine.place_bid(...)` en el router (`app/modules/ofertas/router.py`), sin tocar el motor. |
| Tiempo de respuesta de la API | `RedisMetricsRecorder.get_average_ms("api_response")` -- instrumentado en `RequestContextMiddleware`, sobre `duration_ms` que ya se calculaba y logueaba desde la Fase 1. |
| Errores recientes | `RedisMetricsRecorder.get_count("errors_total")` -- incrementado en `handle_unexpected_error` (`app/core/exceptions.py`) cada vez que un request termina en un error 500 no manejado. |
| Uso de memoria | `psutil.Process().memory_info().rss`, en MB -- del **proceso** de este backend, no del host. |
| Uso de CPU | `psutil.Process().cpu_percent(interval=None)` -- ídem, del proceso. |

### Por qué "por minuto" viene de Postgres y no de `RedisMetricsRecorder`

Mensajes de chat y ofertas ya se persisten con `created_at` -- una consulta directa
(`COUNT(*) WHERE created_at >= now() - 60s`) es exacta y no necesita ningún contador
adicional en Redis. `RedisMetricsRecorder` se reserva para lo que **no** está
persistido y necesita instrumentación real (tiempos de procesamiento, conteo de
errores no manejados).

### `RedisMetricsRecorder` -- ventana fija por minuto

Mismo patrón que `RedisRateLimiter` (`INCR`/`HINCRBY` + `EXPIRE`, Módulo 6.4): cada
`record_timing`/`record_event` escribe en el bucket del minuto en curso
(`epoch // 60`), con TTL de 3 minutos. `get_average_ms` suma el bucket actual + el
anterior (para no mostrar `None` justo al cruzar un minuto sin actividad todavía en el
bucket nuevo); `get_count` lee solo el bucket actual (un conteo de errores cayendo a 0
justo después de cruzar un minuto es una lectura correcta, no un hueco que haya que
suavizar).

## Logging

| Requisito del enunciado | Estado |
|---|---|
| Inicio y cierre de servicios | **Nuevo**: `app_starting`/`app_started`/`app_shutting_down`/`app_stopped` en `app/main.py`. Los componentes individuales ya logueaban su propio ciclo de vida (`event_consumer_stopped`, `ws_connection_registered`, etc.) desde fases anteriores; faltaba el marcador del proceso completo. |
| Errores inesperados | **Ya existía** (Fase 1): `handle_unexpected_error` (`app/core/exceptions.py`) hace `logger.exception("unhandled_exception", incident_id=..., path=...)` para cualquier excepción no manejada. Este módulo solo le agregó el contador de métricas (ver arriba), sin tocar el logging. |
| Advertencias | **Ya existía**: `logger.warning(...)` ya presente en varios puntos (`analytics_cache_read_failed`, `chat_system_message_integrity_error_without_existing_row`, rate limiting, etc.), y ahora también en los `record_timing`/`record_event` best-effort de este módulo si Redis falla. |
| Eventos críticos | **Nuevo**: `health_check_failed` (`logger.error`, cuando un componente de salud está caído) se suma a los ya existentes (`ws_close_all_failed_for_connection`, etc.). |
| Logs estructurados | **Ya existía** (Fase 1): `configure_logging` (`app/core/logging.py`), `structlog` + JSON en producción (`LOG_JSON`), `request_id` propagado por request vía `contextvars`. Sin cambios. |

## Preparación para Prometheus/Grafana -- preparado, no construido

Mismo criterio "preparado, no construido" que el proyecto ya aplicó a streaming
(ADR-005) y a la exportación de reportes del Módulo 7.3 (ADR-040): no se agrega la
dependencia `prometheus-client` ni un endpoint `/metrics` en formato texto ahora. La
preparación real es que `GET /monitoring/metrics` ya es un contrato JSON limpio y
tipado (`PlatformMetrics`) -- un exportador futuro consumiría exactamente estos mismos
campos (o llamaría a `MonitoringService.get_metrics()` directo) para traducirlos al
formato de texto de Prometheus, sin tocar `MonitoringService` ni el resto de este
módulo.

## Control de acceso

- `GET /monitoring/health`: público, sin autenticación.
- `GET /monitoring/metrics`: exclusivo de `admin` (`require_roles`, mismo patrón que
  `GET /audit`) -- expone throughput y conteos operativos, información sensible del
  negocio.

## Interfaz -- frontend

`features/monitoring/`, paralelo a `features/analytics/`/`features/audit/`:

| Archivo | Qué hace |
|---|---|
| `types.ts` | Espeja `HealthCheckResponse`/`PlatformMetrics`. |
| `api.ts` | `fetchPlatformHealthRequest`, `fetchPlatformMetricsRequest`. |
| `hooks.ts` | `usePlatformMonitoring` -- polling simple (`setInterval`, 10s), no WebSocket: son snapshots periódicos, no eventos de dominio. |
| `components/HealthStatusPanel.tsx` | Badges por componente (API/PostgreSQL/Redis/WebSocket). |
| `components/MetricsGrid.tsx` | Tarjetas KPI -- reutiliza `KpiCard` de `features/analytics/components/` tal cual. |
| `components/MonitoringPanel.tsx` | Composición completa, tercera pestaña de `/admin` (`AdminAuditLogPage.tsx`). |

"Actualizar automáticamente cuando sea posible" se resuelve con refetch cada 10s
mientras la pestaña está montada -- al cambiar de pestaña el componente se desmonta y
el intervalo se limpia solo (cleanup estándar de `useEffect`, sin mecanismo especial de
pausa).

## Limitaciones conocidas (documentadas, no huecos)

- **Memoria/CPU son del proceso de este backend, no del host** -- en un despliegue
  multi-instancia (ADR-001), cada instancia reporta lo suyo; un número de host
  agregado no sería atribuible a ninguna instancia en particular.
- **Los promedios de timing son una ventana de ~1-2 minutos**, no un histograma
  completo -- suficiente para un panel de monitoreo en vivo, no para análisis
  estadístico fino (percentiles, etc.), que es exactamente lo que Prometheus/Grafana
  aportarían a futuro.
- **Sin exportación real a Prometheus/Grafana** -- arquitectura preparada, no
  construida (ver sección dedicada).
- **El chequeo de WebSocket no es un "ping" real de un gateway completo** -- reporta
  si el `ConnectionManager` del proceso está vivo, no si cada conexión individual
  responde.

## Checklist del módulo

- [x] Health checks de API, PostgreSQL, Redis y WebSocket.
- [x] Métrica: usuarios conectados.
- [x] Métrica: WebSockets activos.
- [x] Métrica: mensajes de chat por minuto.
- [x] Métrica: ofertas por minuto.
- [x] Métrica: tiempo promedio de procesamiento de una oferta.
- [x] Métrica: tiempo de respuesta de la API.
- [x] Métrica: uso de memoria.
- [x] Métrica: uso de CPU.
- [x] Logging: inicio y cierre de servicios, errores inesperados, advertencias,
      eventos críticos, logs estructurados.
- [x] Panel de monitoreo para administradores, tarjetas KPI, actualización automática.
- [x] Monitoring Service desacoplado (`app/monitoring/`).
- [x] Preparado (no construido) para Prometheus/Grafana, documentado.
- [x] Cero cambios en la lógica de negocio existente.
- [x] Tests: `test_redis_metrics.py`, `test_monitoring_repository.py`,
      `test_monitoring_service.py` (incluye health degradado simulando Postgres/Redis
      caídos), `test_monitoring_router.py`; test nuevo en
      `test_architecture_boundaries.py`; frontend: `hooks.test.ts` (polling con fake
      timers), `HealthStatusPanel.test.tsx`, `MetricsGrid.test.tsx`.
- [x] Documentación (este archivo) y ADR (ADR-041) actualizados.
