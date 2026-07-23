# ADR-041: Observabilidad y Monitoreo — health check nuevo sin tocar el existente, instrumentación no invasiva, métricas de proceso, Prometheus preparado no construido

- **Fecha**: 2026-08-05
- **Estado**: Aceptada

## Contexto

El enunciado pide preparar la plataforma para producción con health checks, métricas
operativas y logging mejorado, explícitamente **sin modificar lógica de negocio ni
romper la arquitectura existente**. Es la primera fase puramente de
infraestructura/operabilidad del proyecto -- el desafío de diseño no es "qué medir"
sino cómo medirlo sin tocar el código que se está midiendo.

## Decisión

### A. `GET /health` (existente) no se toca; se agrega `GET /monitoring/health` nuevo

`app/main.py` ya expone `GET /health` desde la Fase 1 (ping de Redis). No está
referenciado por ningún `healthcheck` de `docker-compose.yml` (solo `db`/`redis`
tienen el suyo propio, nativo de sus imágenes), pero eso no garantiza que nada externo
dependa de su forma exacta hoy -- el costo de tocarlo (riesgo de romper algo que lo
consume) supera el beneficio de reutilizar el mismo endpoint. Se agrega
`GET /monitoring/health`, más completo (los cuatro componentes que pide el
enunciado), como parte del Monitoring Service nuevo. Ambos endpoints coexisten sin
conflicto.

### B. Health público, métricas admin-only

`GET /monitoring/health` no exige autenticación: las herramientas de infraestructura
(load balancer, probes de orquestación de contenedores, servicios de uptime externos)
no tienen credenciales de la aplicación, y exigírselas las dejaría ciegas
precisamente cuando más falta hace verificar que la API responde. `GET
/monitoring/metrics`, en cambio, expone throughput y conteos operativos --
información de negocio sensible (cuánta actividad tiene la plataforma) -- así que
exige `admin` (`require_roles`, mismo patrón ya usado por `GET /audit`).

### C. Instrumentación no invasiva: envolver la llamada, nunca tocar lo medido

Dos métricas piden un *timing* real que no se puede derivar de datos ya persistidos:
tiempo de procesamiento de una oferta y tiempo de respuesta de la API. Ninguna de las
dos se instrumenta modificando el código medido:

- **Tiempo de respuesta de la API**: `RequestContextMiddleware`
  (`app/core/middleware.py`) ya calculaba y logueaba `duration_ms` de cada request
  desde la Fase 1. Se agregó una única línea additiva, best-effort, que además lo
  registra en `RedisMetricsRecorder` -- el logging existente (`request_completed`) no
  cambió un bit.
- **Tiempo de procesamiento de una oferta**: se descartó instrumentar
  `AuctionEngine.place_bid` directamente (el componente más sensible del sistema, ver
  docs/17-auction-engine.md: "el módulo más sensible del sistema"). En cambio, el
  router de ofertas (`app/modules/ofertas/router.py`, capa de transporte, no de
  negocio) envuelve la llamada ya existente a `engine.place_bid(...)` con un timer.
  `AuctionEngine` queda exactamente igual, sin una sola línea tocada -- su propia
  suite de tests (`test_auction_engine.py`) lo confirma sin cambios.

Ambos puntos de instrumentación son **best-effort**: si Redis falla al registrar la
métrica, se loguea una advertencia y se sigue -- una falla de observabilidad nunca
puede convertir un request exitoso (o una oferta exitosa) en un error. Mismo criterio
ya establecido para `EventBus.publish` (ADR-022) y la caché de Analítica (ADR-038).

### D. `RedisMetricsRecorder`: ventana fija por minuto, mismo patrón que `RedisRateLimiter`

Se decidió replicar el patrón ya usado por `RedisRateLimiter` (`app/redis/rate_limit.py`,
Módulo 6.4: `INCR`/`HINCRBY` + `EXPIRE`, fixed-window) en vez de una estructura más
sofisticada (ventana deslizante, histograma con percentiles) -- alcanza para un panel
de monitoreo en vivo con actualización cada 10s, y mantiene el árbol de dependencias
sin agregar nada nuevo más allá de Redis, que el proyecto ya usa extensivamente
(ADR-002). `get_average_ms` suma el bucket actual + el anterior para no mostrar
`None` justo al cruzar un minuto sin actividad nueva todavía; `get_count` (usado solo
para el contador de errores) lee únicamente el bucket actual, porque ahí un `0`
justo después de cruzar el minuto es una lectura correcta, no un hueco a suavizar.

### E. "Por minuto" (chat/ofertas) sale de Postgres, no de un contador en Redis

A diferencia de los dos timings de la sección C, la cantidad de mensajes de chat y de
ofertas por minuto **ya está completamente persistida** (`ChatMessage.created_at`,
`Oferta.created_at`) -- una consulta `COUNT(*) WHERE created_at >= now() - 60s`,
global (no por remate, a diferencia de `AnalyticsRepository.count_ofertas_since`), es
exacta y no necesita ningún contador adicional. Se descartó duplicar ese dato en Redis
(un contador que podría desincronizarse de lo que Postgres, la fuente de verdad,
realmente tiene -- ADR-002) solo por consistencia de implementación con los dos
timings: son problemas distintos (uno necesita medir algo que no se persiste, el otro
solo contar algo que ya se persiste) y merecen soluciones distintas.

### F. Memoria/CPU del proceso, no del host

`psutil.Process()` (el proceso de **este** backend), no `psutil.virtual_memory()`/
`cpu_percent()` a nivel de sistema. En el despliegue multi-instancia que el proyecto
ya asume (ADR-001, "múltiples instancias sin estado compartido en memoria"), un
número de host agregado mezclaría el consumo de todas las instancias (y de cualquier
otro proceso corriendo en la misma máquina/contenedor) sin poder atribuirlo a
ninguna -- cada instancia reportando su propio proceso es el dato realmente accionable.
Se prioriza `psutil` sobre alternativas de la librería estándar (`resource`,
específico de Unix) por ser multiplataforma (Windows en desarrollo, Linux en Docker).

### G. Prometheus/Grafana: preparado, no construido

Mismo criterio que ADR-005 (streaming) y ADR-040 (exportación de reportes del Módulo
7.3): no se agrega la dependencia `prometheus-client` ni un endpoint `/metrics` en
formato texto ahora -- el enunciado pide explícitamente preparar la integración, no
construirla. `GET /monitoring/metrics` ya es el contrato de datos limpio y tipado
(`PlatformMetrics`) que un exportador futuro traduciría a formato Prometheus sin
tocar `MonitoringService`.

## Alternativas consideradas

- **Extender el `/health` existente** en vez de agregar uno nuevo: descartada, ver
  sección A -- el riesgo de romper algo que ya lo consume supera el beneficio.
- **Instrumentar `AuctionEngine.place_bid` directamente**: descartada, ver sección C
  -- el componente más sensible del sistema no debía tocarse por una necesidad de
  observabilidad.
- **Contador de "ofertas/mensajes por minuto" en Redis**, por consistencia con los
  timings: descartada, ver sección E -- Postgres ya tiene el dato exacto, duplicarlo
  agregaría una superficie de inconsistencia sin ningún beneficio.
- **Métricas de CPU/memoria a nivel de host**: descartada, ver sección F -- no
  atribuible a una instancia en un despliegue multi-instancia.
- **Integrar Prometheus/Grafana ahora**: descartada, pedido explícito del enunciado de
  dejarlo preparado, no construido (sección G).

## Consecuencias

- **Ventajas**: cero cambios en `AuctionEngine` ni en ninguna otra lógica de negocio;
  el `/health` existente queda intacto, sin riesgo para quien ya lo consuma; toda la
  instrumentación es best-effort, no puede degradar la experiencia de un usuario real
  por una falla de observabilidad; el módulo se integró sin tocar `app/realtime/`, el
  Gateway WebSocket (más allá de leer `ConnectionManager`, ya público), `app/presence/`,
  `app/snapshot/`, `app/audit/`, `app/analytics/` ni `app/history/`.
- **Desventajas aceptadas**: los promedios de timing son una ventana de ~1-2 minutos,
  no un histograma con percentiles (eso es exactamente lo que Prometheus aportaría a
  futuro); memoria/CPU son por instancia, no un agregado de host; sin exportación real
  a Prometheus/Grafana todavía (esperado por el enunciado).
- Integrar un exportador de Prometheus a futuro es: una dependencia nueva
  (`prometheus-client`) + un endpoint `/metrics` que traduzca `PlatformMetrics` (o
  llame a `MonitoringService.get_metrics()` directo) a formato texto -- sin reabrir
  `MonitoringService`, `RedisMetricsRecorder` ni ningún punto de instrumentación ya
  existente.
