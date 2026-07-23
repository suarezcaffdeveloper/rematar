# 39 — Pruebas de Carga y Rendimiento (Épica 8, Módulo 8.2)

Este documento es la referencia de diseño del entorno de pruebas de carga: qué mide
cada escenario, de dónde sale cada métrica, cómo se generan los reportes y qué queda
documentado como limitación conocida. A diferencia de todos los módulos anteriores,
este vive **fuera** de `backend/`/`frontend/` -- es una herramienta cliente separada
que habla con RematAR únicamente por HTTP/WebSocket. Ver
[ADR-042](adr/ADR-042-pruebas-de-carga-y-rendimiento.md) para el razonamiento completo
de las decisiones tomadas.

## Alcance de este módulo

- Un entorno de carga (`loadtest/`, proyecto Python independiente, venv propio) capaz
  de simular cientos o miles de compradores conectados, generar ofertas y mensajes de
  chat a alta frecuencia, y medir el comportamiento del sistema mientras tanto.
- Cinco escenarios parametrizables (no siete scripts distintos: 100/500/1000
  compradores son tres valores de un mismo flag, no tres implementaciones).
- Recolección de métricas del lado del cliente (lo que el generador de carga observa
  directamente) **y** del lado del servidor (reutilizando `GET /monitoring/metrics`,
  Épica 8, Módulo 8.1) en el mismo reporte.
- Generación automática de `summary.json` (datos crudos) + `report.html` (reporte
  visual autocontenido, gráficos embebidos) + `comparison.html` (comparación entre
  corridas).
- Un motor de recomendaciones básico, basado en los umbrales ya documentados en
  [04-requisitos-no-funcionales.md](04-requisitos-no-funcionales.md).

**No se implementa**: un motor de distribución de carga entre múltiples máquinas
(innecesario para el techo pedido, 100-1000 compradores, ver ADR-042); modificación
alguna del backend/frontend (cero cambios, ni un endpoint nuevo); limpieza automática
de los remates/lotes/usuarios sintéticos que cada corrida crea (documentado como
limitación, ver más abajo).

## Dónde vive el código

`loadtest/` -- directorio top-level, hermano de `backend/`/`frontend/`, con su propio
`pyproject.toml` y entorno virtual. **Cero imports de `backend/app`**: reimplementa el
protocolo del Gateway WebSocket (`docs/20-gateway-websocket.md`) desde su
documentación pública, exactamente como lo haría un cliente externo real.

| Archivo | Responsabilidad |
|---|---|
| `loadtest/config.py` | `RunConfig` -- host, credenciales de admin, directorios de cache/resultados. |
| `loadtest/identity.py` | Alta/login de compradores y rematador vía la API pública, con cache en disco. |
| `loadtest/fixtures.py` | Crea remate(s)+lote(s) `LIVE`/`OPEN` vía la API del rematador (mismo flujo que un rematador real: `schedule` → `start` → `open`). |
| `loadtest/client_http.py` | Wrapper de `httpx.AsyncClient` que mide cada llamada. |
| `loadtest/client_ws.py` | Cliente WebSocket propio (auth, heartbeat, `join_room`) -- protocolo reimplementado desde `docs/20`. |
| `loadtest/metrics.py` | `MetricsCollector` (latencias/throughput/errores del cliente) + `MonitoringPoller` (sondea `GET /monitoring/metrics` del servidor). |
| `loadtest/report.py` | `summary.json` + `report.html`, motor de recomendaciones. |
| `loadtest/compare.py` | `comparison.html` a partir de varios `summary.json`. |
| `loadtest/charting.py` | Utilidades compartidas de matplotlib/jinja2. |
| `loadtest/cli.py` | `python -m loadtest run <escenario>` / `... compare ...`. |
| `loadtest/scenarios/*.py` | Los cinco escenarios (ver abajo). |
| `loadtest/tests/` | Tests unitarios de lógica pura (percentiles, recomendaciones) -- no requieren un backend corriendo. |

## Los cinco escenarios

### 1. `connected_buyers` -- N compradores conectados (100/500/1000)

Conecta `--num-buyers` compradores por WebSocket a la sala de un único remate `LIVE`,
sin generar tráfico propio más allá de la conexión y el heartbeat -- mide capacidad de
conexión pura. Valida directamente **RNF-04** (al menos 2000 WebSockets concurrentes
como objetivo de diseño). Correr con `--num-buyers 100`, `500` y `1000` son tres
corridas de la misma lógica, comparables después con `loadtest compare`.

### 2. `concurrent_remates` -- múltiples remates simultáneos

Reparte el pool total de compradores entre `--num-remates` salas independientes, cada
una con su propio remate `LIVE`+lote `OPEN`. Valida **RNF-06** (la cantidad de remates
simultáneos no debe estar acotada por diseño).

### 3. `bid_storm` -- miles de ofertas consecutivas

Un pool de compradores ofertando en paralelo sobre un único lote, tan rápido como
`--think-time-ms` lo permite. Es el stress test más directo del Auction Engine
(`SELECT FOR UPDATE`, [ADR-004](adr/ADR-004-concurrencia-en-determinacion-de-ganador.md)):
la mayoría de las ofertas se **rechazan** (solo una puede ser la vigente en cada
instante) -- eso es correcto, no un error. `POST .../ofertas` siempre responde `201`
(el resultado va en el cuerpo, ver `docs/17-auction-engine.md`), así que el escenario
cuenta aceptadas/rechazadas leyendo `status` del cuerpo, no el código HTTP.

### 4. `chat_concurrency` -- chat con alta concurrencia

Compradores conectados por WebSocket (reciben el broadcast) mientras una fracción de
ellos (`--senders-fraction`) envía mensajes por `POST .../chat/messages` a una tasa
configurable. El rate limiting existente (5 mensajes/10s por usuario,
`docs/34-chat-del-remate.md`) no se desactiva -- una fracción esperable de mensajes en
`429` es el comportamiento correcto bajo ráfaga, no una falla del sistema.

### 5. `notifications_broadcast` -- latencia de difusión en tiempo real

Un comprador designado ("prober") oferta en rondas con montos crecientes; cada oferta
aceptada dispara `OfertaAccepted` (`event_type: "oferta.accepted"`), que el pipeline de
sincronización en tiempo real (Épica 3, Módulo 3.5) reenvía a todos los compradores
conectados a la sala. Cada cliente resta el `occurred_at` del evento (timestamp del
servidor al publicarlo) de su propio momento de recepción -- esa diferencia es la
latencia de difusión servidor→N clientes. Valida directamente **RNF-01** ("difusión de
una oferta aceptada... en menos de 300ms p95 bajo carga nominal").

## De dónde sale cada métrica pedida

| Métrica pedida | Fuente | Dónde en el reporte |
|---|---|---|
| Latencia promedio / máxima | Muestras de timing del cliente (conexión WS, POST de oferta/chat, entrega de evento) | `*.client_perceived.{avg_ms,max_ms}` |
| Requests por segundo | Timestamps de cada llamada HTTP, bucketing por segundo | `http.requests_per_second` + gráfico |
| Mensajes WebSocket por segundo | Timestamps de envío/recepción WS | `websocket.messages_per_second` + gráfico |
| Ofertas procesadas por segundo | `bid_storm`: aceptadas+rechazadas / duración | `ofertas.processed_per_second` |
| Tiempo de procesamiento de una oferta | **Dos números en el mismo reporte**: percibido por el cliente (`ofertas.client_perceived`, incluye red) y medido por el servidor (`avg_oferta_processing_ms`, instrumentación del Módulo 8.1, sin red) | `ofertas.client_perceived` vs. `server_metrics.samples[].avg_oferta_processing_ms` |
| Uso de CPU | `GET /monitoring/metrics` -- `cpu_usage_percent`, proceso del backend (no el host, mismo criterio que ADR-041) | `server_metrics.samples[].cpu_usage_percent` + gráfico |
| Uso de memoria | Ídem, `memory_usage_mb` | `server_metrics.samples[].memory_usage_mb` + gráfico |
| Cantidad de conexiones activas | Ídem, `connected_users`/`active_websockets` | gráfico "Conexiones activas" |
| Errores detectados | No-2xx / excepciones de red del cliente, más `errors_last_minute` del servidor | `errors.count` + `server_metrics.samples[].errors_last_minute` |

Las métricas de servidor son **best-effort**: si el login de admin falla (credenciales
incorrectas, admin no bootstrapeado), la corrida sigue igual, solo sin esa serie
temporal -- ver `loadtest/scenarios/_shared.py:try_start_monitoring`.

## Reportes

- **`summary.json`**: config de la corrida, agregados (avg/p50/p95/p99/max) y series
  temporales crudas -- entrada de `loadtest compare`.
- **`report.html`**: autocontenido (gráficos como PNG embebidos en base64 vía
  matplotlib, backend `Agg`; se abre con doble click, sin servidor). Secciones:
  configuración, resumen ejecutivo (KPIs), recomendaciones, tablas de latencia HTTP/WS,
  gráficos, muestra de errores.
- **`comparison.html`**: tabla + gráficos de barras comparando varias corridas (por
  ejemplo, p95 de oferta a 100 vs. 500 vs. 1000 compradores).

### Motor de recomendaciones (`loadtest/report.py:build_recommendations`)

Reglas fijas, deliberadamente básicas -- no un análisis estadístico:

| Condición | Recomendación |
|---|---|
| p95 de oferta > 150ms (RNF-02) | Revisar contención del lock de fila del Auction Engine (ADR-004) o el pool de conexiones a Postgres. |
| p95 de difusión > 300ms (RNF-01) | Revisar throughput de Redis Pub/Sub y del Event Consumer (Módulo 3.5). |
| CPU del servidor > 80% en más de la mitad de la corrida | Considerar escalar horizontalmente (ADR-001). |
| Memoria del servidor creció > 50MB entre el primer y el último cuarto de la corrida | Posible fuga de memoria -- investigar. |
| Tasa de error > 2% de los requests | Revisar rate limiting, timeouts y pool de conexiones. |
| > 1% de conexiones WebSocket fallidas | Investigar antes de acercarse a las 2000 conexiones de RNF-04. |

Si ninguna condición se dispara, el reporte lo dice explícitamente ("el sistema se
comportó dentro de lo esperado").

## Cómo interpretar un reporte -- guía rápida

1. **Mirar primero las recomendaciones** -- son el resumen de "qué mirar", no un
   veredicto definitivo.
2. **Comparar p95, no el promedio** -- el promedio esconde colas largas; RNF-01/RNF-02
   están expresados en p95 a propósito.
3. **Cruzar latencia del cliente con la del servidor** -- si `ofertas.client_perceived`
   es alta pero `avg_oferta_processing_ms` del servidor es baja, el cuello de botella
   está en la red/el propio generador de carga, no en el backend.
4. **Un error rate alto durante `bid_storm` no es necesariamente un problema** -- la
   mayoría de las ofertas rechazadas son el comportamiento correcto del Auction Engine.
   Revisar la sección `extra.ofertas_rejected` vs. `errors.count`: rechazos de negocio
   (HTTP 201, `status: "rejected"`) no cuentan como error; solo un código ≥400 o una
   excepción de red sí.

## Limitaciones conocidas (documentadas, no huecos)

- **Un único proceso Python por corrida** -- suficiente para el techo pedido (miles de
  compradores simulados), pero no pensado para escalar a decenas de miles de
  conexiones simultáneas; eso requeriría el patrón distribuido de herramientas como
  Locust (descartado para este alcance, ver ADR-042).
- **Datos de prueba no se limpian automáticamente** -- cada corrida crea remates/lotes/
  usuarios reales vía la API pública; en un entorno compartido, usar una base
  descartable.
- **Hallazgo real, encontrado corriendo este módulo contra el entorno de desarrollo
  local**: cada conexión WebSocket registrada (`app/websocket/router.py:
  websocket_gateway`) mantiene abierta, durante **toda la vida de la conexión**, la
  sesión de Postgres que FastAPI le inyectó vía `Depends(get_auth_service)` -> `Depends
  (get_db)` -- `get_db` (`app/db/session.py`) documenta explícitamente "una sesión por
  *request*", una suposición razonable para HTTP (la sesión se libera cuando el
  handler retorna) pero que no aplica igual a un WebSocket: para ese endpoint, la
  función no retorna hasta que la conexión se cierra, así que la sesión (y la conexión
  de Postgres subyacente) queda retenida todo ese tiempo. En este entorno de
  desarrollo (`docker compose up`, pool por defecto de SQLAlchemy: 5 + 10 de
  overflow = 15 conexiones), correr `connected_buyers`/`notifications_broadcast`/
  `chat_concurrency` con más de ~15 compradores conectados simultáneamente agota el
  pool por completo -- cualquier otra operación que necesite Postgres (una oferta,
  el propio `MonitoringPoller`, un nuevo login) queda encolada hasta agotar el timeout
  del pool (`sqlalchemy.exc.TimeoutError`, 30s por defecto), confirmado reproduciendo
  el problema y leyendo `pg_stat_activity` (conexiones quedan en `idle in
  transaction`, nunca liberadas hasta que la conexión WS se cierra). **Esto no es un
  defecto de esta herramienta**: es exactamente el tipo de límite de escalabilidad
  real que este módulo existe para revelar, y es la brecha más concreta entre el
  objetivo de diseño de RNF-04 (2000 conexiones WebSocket concurrentes) y lo que el
  backend puede sostener hoy sin cambios -- ver recomendaciones de escalado.
- **Las métricas de servidor dependen de que el login de admin funcione** -- si falla,
  el reporte queda sin esa serie temporal (best-effort, documentado arriba), pero la
  corrida no se aborta.
- **`GET /monitoring/metrics` es por instancia** (Módulo 8.1, ADR-041) -- contra un
  backend con múltiples réplicas detrás de un balanceador, el poller solo ve la
  instancia que le respondió esa request puntual, no un agregado de todas.

## Checklist del módulo

- [x] Escenario: 100/500/1000 compradores conectados (`connected_buyers`, parametrizado).
- [x] Escenario: múltiples remates simultáneos (`concurrent_remates`).
- [x] Escenario: miles de ofertas consecutivas (`bid_storm`).
- [x] Escenario: chat con alta concurrencia (`chat_concurrency`).
- [x] Escenario: notificaciones en tiempo real (`notifications_broadcast`, valida RNF-01).
- [x] Métrica: latencia promedio y máxima.
- [x] Métrica: requests por segundo.
- [x] Métrica: mensajes WebSocket por segundo.
- [x] Métrica: ofertas procesadas por segundo.
- [x] Métrica: tiempo de procesamiento de una oferta (cliente y servidor).
- [x] Métrica: uso de CPU y memoria (del proceso del backend).
- [x] Métrica: cantidad de conexiones activas.
- [x] Métrica: errores detectados.
- [x] Reporte: resumen de ejecución, gráficos, comparación entre escenarios, recomendaciones básicas.
- [x] Arquitectura separada del backend/frontend, documentada.
- [x] Guía de ejecución (`loadtest/README.md`).
- [x] Tests: `loadtest/tests/test_metrics.py`, `loadtest/tests/test_report.py`.
- [x] Documentación (este archivo) y ADR (ADR-042) actualizados.
- [x] Cero cambios en `backend/app`/`frontend/src`.
