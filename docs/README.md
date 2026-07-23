# RematAR — Documentación de Arquitectura

## Qué es esto

RematAR es una plataforma web de remates en vivo. Distintos rematadores operan remates
independientes y simultáneos; los compradores se conectan a cualquier remate, ven la
transmisión y ofertan en tiempo real. El sistema determina el ganador de cada lote de
forma automática y auditable.

Este NO es un CRUD de práctica. El valor de portfolio del proyecto está en cómo resuelve
concurrencia, tiempo real y escalabilidad — no en la cantidad de pantallas.

## Estado actual

**Épica 7, Módulo 7.5 — Gestión Post-Remate.** Un PostAuction Service desacoplado
(`app/postauction/`, paquete transversal top-level, mismo nivel que `app/audit/`/
`app/history/`/`app/monitoring/`) administra el seguimiento de pago y entrega entre
comprador y rematador tras la adjudicación de un lote, sin que el Auction Engine se
entere: reacciona a `lote.winner_determined` (ya publicado por `LoteService.auto_close`
desde la Épica 8) con una **tercera** instancia de `EventConsumer`
(`PostAuctionEventDispatcher`, mismo patrón que `ChatSystemEventDispatcher`) que lee el
JSON crudo del evento sin importar su clase -- `app/modules/remates/lotes/service.py` no
gana un solo import nuevo, garantía verificada con dos tests nuevos en
`test_architecture_boundaries.py`. Flujo de ocho estados (Adjudicado → Pendiente de
contacto → Pago pendiente → Pago recibido → Preparando entrega → Enviado → Entregado →
Finalizado) con una máquina de estados forward-only (`ALLOWED_TRANSITIONS` derivado de
una lista ordenada: cualquier estado posterior, nunca hacia atrás, con saltos
permitidos) -- un único endpoint de cambio de estado cubre también "registrar fecha de
contacto/pago/envío/entrega" (la fecha hito se estampa según a qué estado se llega).
Línea de tiempo propia insert-only (`PostAuctionTimelineEntry`), estructuralmente igual
a `AuditLogEntry` pero propia del módulo (no reutiliza Historial, que no tiene
escritura, ni Auditoría, transversal a toda la plataforma). El enunciado pedía
reutilizar un "Notification Service" que, verificado explícitamente, no existía en el
código -- se construyó una versión mínima y genérica (`app/notifications/`, sin
`service.py`, sin conocer a `postauction` ni a ningún módulo de dominio) que persiste en
la misma transacción que la mutación que la origina, disparada en los cuatro momentos
pedidos (adjudicación, cambio de estado, pago, entrega). Frontend:
`features/postauction/` ("Ventas adjudicadas" del rematador con buscar/filtrar por
estado, "Mis compras" del comprador), `ProgressStepper`/`Timeline` compartidos, botones
de entrada nuevos en ambos dashboards. Limitación documentada: el cierre manual de un
lote vendido (ADR-018) no genera un caso automático, al no haber comprador asociado en
ese flujo. Cero cambios en `AuctionEngine`, `RemateService`, `LoteService`,
`app/websocket/`, `app/snapshot/`, `app/audit/service.py`. Ver
[41-gestion-post-remate.md](41-gestion-post-remate.md), ADR-044.

**Épica 8 — Cuenta Regresiva y Cierre Automático de Lotes.** Implementa por primera
vez algo reservado desde Fase 0: [ADR-007](adr/ADR-007-anti-sniping.md) ya había
decidido el anti-sniping completo (`RemateSettings.anti_sniping_enabled`/
`anti_sniping_extension_seconds`, schema del Módulo 2.1) pero ninguna línea de código
los leía. Timer Service nuevo (`app/timer/`, paquete transversal top-level, mismo
nivel que `app/snapshot/`, sin modelo propio -- el estado del timer vive en tres
columnas nuevas de `Lote`: `timer_ends_at`/`timer_paused_remaining_seconds`/
`timer_auto_close_enabled`, nunca las dos primeras no-`None` a la vez). Arranque del
timer (`LoteService.open`/`open_next`) y extensión anti-sniping
(`AuctionEngine.place_bid`) son llamadas **síncronas** a `@staticmethod`s puros de
`TimerService` -- deliberadamente no vía el Event Bus: una extensión asíncrona podría
perderse justo contra `TimerExpiryScheduler` cerrando el lote en la misma ventana,
mismo razonamiento que ya descartó el Event Bus para auditoría (ADR-039). El cierre
automático sí necesita una tarea de fondo nueva (nada dispara "se acabó el tiempo" por
sí solo): `TimerExpiryScheduler`, mismo patrón que `EventConsumer`/
`ChatSystemEventDispatcher` (arranca/se detiene en el `lifespan`), sondea cada 1s y
reusa el lock de fila de ADR-004 (`get_by_id_for_update`, primera vez usado por algo
distinto del Auction Engine) para serializarse contra un bid o una acción del
rematador en curso. `LoteService.close()` se refactorizó (`_apply_close` privado,
mutación + auditoría compartida) sin cambiar su firma ni comportamiento externo; el
nuevo `auto_close()` lo reusa para la adjudicación automática (`lote.winner_determined`,
implementa `lote.ganador_determinado` reservado desde Fase 0), auditada con
`actor_id=None` (mismo patrón que `RemateService.try_auto_finish`). Nueve eventos de
dominio nuevos, sincronizados por el pipeline ya existente sin tocar
`app/websocket/`/`app/realtime/`. Frontend: `LoteCountdown.tsx` (Sala del comprador y
Consola del rematador) recibe el deadline absoluto del backend y solo recalcula
`endsAt - Date.now()` localmente para el tictac -- el backend decide exclusivamente
cuándo cerrar, nunca el cliente; cinco controles nuevos en `ConsolaControlPanel.tsx`
(pausar/reanudar/reiniciar/fijar tiempo restante/alternar cierre automático). Ver
[40-cuenta-regresiva-y-cierre-automatico.md](40-cuenta-regresiva-y-cierre-automatico.md),
ADR-043.

**Épica 8, Módulo 8.2 — Pruebas de Carga y Rendimiento.** Segunda fase puramente de
infraestructura/operabilidad -- cero funcionalidad de negocio nueva, y a diferencia de
todos los módulos anteriores (incluido el 8.1), vive **fuera** de `backend/`/
`frontend/`: un entorno de carga propio (`loadtest/`, proyecto Python independiente,
venv/dependencias propias -- `httpx`/`websockets`/`matplotlib`/`jinja2`, ninguna se
agrega al backend) que habla con RematAR únicamente por HTTP/WebSocket, reimplementando
el protocolo del Gateway (`docs/20-gateway-websocket.md`) desde su documentación
pública en vez de importar código de `app/websocket/`. Cinco escenarios parametrizables
(no siete scripts distintos): `connected_buyers` (100/500/1000 compradores conectados a
un remate en vivo, RNF-04), `concurrent_remates` (compradores repartidos entre N
remates `LIVE` simultáneos, RNF-06), `bid_storm` (miles de ofertas consecutivas sobre
un lote, stress del Auction Engine y su `SELECT FOR UPDATE`, ADR-004), `chat_concurrency`
(chat a alta frecuencia respetando el rate limiting existente) y
`notifications_broadcast` (mide la latencia de difusión de un evento de dominio a N
clientes conectados, valida directamente RNF-01: <300ms p95). Las métricas de servidor
(CPU/memoria/conectados/timings) no se instrumentan de nuevo: un `MonitoringPoller`
sondea el `GET /monitoring/metrics` del Módulo 8.1 ya existente durante cada corrida,
reutilizando esa inversión en vez de duplicarla -- best-effort, si el login de admin
falla la corrida sigue sin esa serie temporal. El seed de datos (compradores,
rematador, remates/lotes `LIVE`+`OPEN`) se hace exclusivamente vía la API pública, cero
acceso directo a la base. Cada corrida genera `summary.json` (datos crudos) +
`report.html` (autocontenido, gráficos como PNG embebidos, sin servidor) con un motor
de recomendaciones básico contra los umbrales de RNF-01/02/04
([04-requisitos-no-funcionales.md](04-requisitos-no-funcionales.md)); `loadtest compare`
genera `comparison.html` entre corridas (ver
[ADR-042](adr/ADR-042-pruebas-de-carga-y-rendimiento.md)). Ver
[39-pruebas-de-carga-y-rendimiento.md](39-pruebas-de-carga-y-rendimiento.md) para el
diseño completo y [loadtest/README.md](../loadtest/README.md) para cómo instalarlo y
correr cada escenario.

**Épica 8, Módulo 8.1 — Observabilidad y Monitoreo.** Primera fase puramente de
infraestructura/operabilidad -- cero funcionalidad de negocio nueva. Un Monitoring
Service (`app/monitoring/`, paquete transversal nuevo, mismo nivel que
`app/analytics/`/`app/audit/`/`app/history/`, sin modelo propio ni migración) expone
`GET /monitoring/health` (público, para probes de infraestructura: API, PostgreSQL,
Redis, Gateway WebSocket -- distinto del `/health` ya existente, que se deja intacto
por si algo externo depende de su forma actual) y `GET /monitoring/metrics`
(admin-only: usuarios conectados/WebSockets activos vía `ConnectionManager`, mensajes
de chat y ofertas por minuto vía consultas globales nuevas a Postgres, tiempo promedio
de procesamiento de una oferta y de respuesta de la API, errores recientes, memoria/CPU
del proceso). La instrumentación de timing es deliberadamente no invasiva: el router de
ofertas envuelve la llamada ya existente a `AuctionEngine.place_bid(...)` con un timer
sin tocar el motor (el componente más sensible del sistema), y
`RequestContextMiddleware` gana una línea additiva sobre `duration_ms` que ya
calculaba -- ambos best-effort vía `RedisMetricsRecorder` (`app/redis/metrics.py`,
nuevo, mismo patrón fixed-window por minuto que `RedisRateLimiter`). Logging: cuatro
logs nuevos de ciclo de vida del proceso completo
(`app_starting`/`app_started`/`app_shutting_down`/`app_stopped`) -- errores
inesperados, advertencias y logs estructurados ya estaban cubiertos desde la Fase 1.
Memoria/CPU son del **proceso** de este backend (`psutil`, dependencia nueva), no del
host -- en el despliegue multi-instancia que el proyecto ya asume (ADR-001), un número
de host agregado no sería atribuible a ninguna instancia. Preparación para
Prometheus/Grafana: arquitectónica, no construida -- `GET /monitoring/metrics` ya es
el contrato JSON limpio que un exportador futuro traduciría sin tocar
`MonitoringService` (ver [ADR-041](adr/ADR-041-observabilidad-y-monitoreo.md)). En el
frontend, `features/monitoring/` agrega una tercera pestaña "Monitoreo" a `/admin`
(junto a Auditoría e Historial), con `usePlatformMonitoring` (polling cada 10s) y
tarjetas KPI que reutilizan `KpiCard` de Analítica. Ver
[38-observabilidad-y-monitoreo.md](38-observabilidad-y-monitoreo.md). Esta carpeta
sigue siendo la fuente de verdad del proyecto: cada fase nueva debe leerla antes de
proponer cambios y actualizarla si algo deja de ser cierto. Ver el
[README raíz](../README.md) para instrucciones de instalación y el estado exacto del
código.

## Índice

| Documento | Contenido |
|---|---|
| [01-vision-general.md](01-vision-general.md) | Descripción del proyecto, objetivos funcionales y técnicos |
| [02-roles-y-casos-de-uso.md](02-roles-y-casos-de-uso.md) | Roles del sistema y casos de uso |
| [03-requisitos-funcionales.md](03-requisitos-funcionales.md) | Requisitos funcionales (RF) |
| [04-requisitos-no-funcionales.md](04-requisitos-no-funcionales.md) | Rendimiento, escalabilidad, seguridad, consistencia, etc. |
| [05-flujo-de-negocio.md](05-flujo-de-negocio.md) | Flujo completo de negocio, de creación de remate a cierre |
| [06-eventos-del-sistema.md](06-eventos-del-sistema.md) | Catálogo de eventos de dominio |
| [07-maquinas-de-estado.md](07-maquinas-de-estado.md) | Estados de Remate, Lote y Oferta |
| [08-riesgos-tecnicos.md](08-riesgos-tecnicos.md) | Riesgos técnicos identificados y mitigaciones |
| [09-arquitectura-y-decisiones.md](09-arquitectura-y-decisiones.md) | Arquitectura general y enlace a los ADR |
| [10-diagramas.md](10-diagramas.md) | Diagrama de módulos y diagrama de flujo principal |
| [11-glosario.md](11-glosario.md) | Glosario de términos |
| [12-stack-tecnologico.md](12-stack-tecnologico.md) | Justificación de cada tecnología elegida |
| [13-mvp-y-roadmap.md](13-mvp-y-roadmap.md) | Alcance del MVP y roadmap futuro |
| [14-modulo-remate.md](14-modulo-remate.md) | Diseño de la entidad Remate: campos, estados implementados, permisos (Épica 2.1) |
| [15-modulo-lote.md](15-modulo-lote.md) | Diseño de la entidad Lote: campos, estados, permisos, reordenamiento (Épica 2.2) |
| [16-motor-de-estados.md](16-motor-de-estados.md) | Motor de estados de Remate y Lote: transiciones, reglas de negocio, finalización automática (Épica 2.3) |
| [17-auction-engine.md](17-auction-engine.md) | Auction Engine: entidad Oferta, funcionamiento interno, diagrama de flujo, preparación para Redis/WebSockets (Épica 2.4) |
| [18-integracion-redis.md](18-integracion-redis.md) | Integración de Redis: cliente compartido, health check, capas de cache/pub-sub/streams/locks (Épica 3.1) |
| [19-arquitectura-de-eventos.md](19-arquitectura-de-eventos.md) | Arquitectura de eventos: catálogo, Event Bus, flujo de publicación, preparación para WebSockets (Épica 3.2) |
| [20-gateway-websocket.md](20-gateway-websocket.md) | Gateway WebSocket: ciclo de vida de conexión, autenticación, heartbeat, `ConnectionManager` (Épica 3.3) |
| [21-sistema-de-salas.md](21-sistema-de-salas.md) | Sistema de salas: `RoomManager`, ciclo de vida de una sala, múltiples conexiones por usuario, preparación para el Event Bus (Épica 3.4) |
| [22-sincronizacion-tiempo-real.md](22-sincronizacion-tiempo-real.md) | Sincronización en tiempo real: Event Consumer, Dispatcher, flujo completo oferta→cliente, preparación para Chat/Notificaciones/Presencia (Épica 3.5) |
| [23-snapshot-service.md](23-snapshot-service.md) | Snapshot Service: reconstrucción de estado, reutilizable por transporte, por qué hace falta snapshot + eventos (Épica 3.6) |
| [24-fundacion-frontend.md](24-fundacion-frontend.md) | Fundación del frontend: estructura de carpetas, ruteo, layouts, cliente HTTP, guards, flujo de autenticación (Épica 4.1) |
| [25-dashboard-comprador.md](25-dashboard-comprador.md) | Dashboard del comprador: flujo de datos, consumo de la API existente, componentes reutilizables, limitaciones conocidas (Épica 4.3) |
| [26-detalle-remate.md](26-detalle-remate.md) | Página de detalle del remate: flujo de datos, listado de lotes, componentes reutilizables, preparación para la sala en vivo (Épica 4.4) |
| [27-sala-del-remate.md](27-sala-del-remate.md) | Sala del remate (versión inicial): flujo Snapshot → Render, estructura de componentes, optimización de renderizado, preparación para WebSockets (Épica 4.5) |
| [28-websocket-tiempo-real-sala.md](28-websocket-tiempo-real-sala.md) | Integración WebSocket y tiempo real: servicio WebSocket reutilizable, flujo Snapshot → WebSocket → Eventos, manejo de los 12 eventos de dominio, preparación para Chat/Presencia/Notificaciones/Streaming (Épica 4.6) |
| [29-dashboard-rematador.md](29-dashboard-rematador.md) | Dashboard del Rematador: flujo de datos, componentes reutilizables, acciones de ciclo de vida (iniciar/reanudar/finalizar), preparación para la Consola Operativa del Rematador (Épica 5.1) |
| [30-consola-operativa-rematador.md](30-consola-operativa-rematador.md) | Consola Operativa del Rematador: diagrama, flujo de cada acción, integración con WebSockets (reutilización de `useLiveRemateState`), preparación para la gestión completa de remates y lotes (Épica 5.2) |
| [31-gestion-remates-lotes.md](31-gestion-remates-lotes.md) | Gestión completa de Remates y Lotes: flujo de creación/edición, drag & drop de reordenamiento, componentes reutilizables (Épica 5.3) |
| [32-gestion-multimedia-lotes.md](32-gestion-multimedia-lotes.md) | Gestión multimedia de los lotes: endpoint de subida a disco local, flujo de carga de archivos, galería (Épica 6.1) |
| [33-sistema-de-presencia.md](33-sistema-de-presencia.md) | Sistema de presencia de usuarios: `PresenceService`, flujo de conexión/desconexión, sincronización en tiempo real, conteo global (Épica 6.2) |
| [34-chat-del-remate.md](34-chat-del-remate.md) | Chat del remate: `ChatService`, envío/historial/moderación, segundo `EventConsumer` para mensajes de sistema, idempotencia, rate limiting (Épica 6.4) |
| [35-dashboard-analitica-tiempo-real.md](35-dashboard-analitica-tiempo-real.md) | Dashboard de analítica en tiempo real: `AnalyticsService`, origen de cada métrica, control de acceso, refetch debounced (Épica 7.1) |
| [36-sistema-de-auditoria-y-trazabilidad.md](36-sistema-de-auditoria-y-trazabilidad.md) | Sistema de auditoría y trazabilidad: `Audit Service`, acciones registradas, escritura atada a la transacción de dominio, estructura de almacenamiento, panel admin/rematador (Épica 7.2) |
| [37-historial-y-resultados-de-remates.md](37-historial-y-resultados-de-remates.md) | Historial y resultados de remates: `History Service`, reutilización de Analytics/Audit, detalle de remate y de lote, preparación para reportes (Épica 7.3) |
| [38-observabilidad-y-monitoreo.md](38-observabilidad-y-monitoreo.md) | Observabilidad y monitoreo: `Monitoring Service`, health checks, cada métrica explicada, logging, preparación para Prometheus/Grafana (Épica 8.1) |
| [39-pruebas-de-carga-y-rendimiento.md](39-pruebas-de-carga-y-rendimiento.md) | Pruebas de carga y rendimiento: entorno `loadtest/` separado, los cinco escenarios, cada métrica y su origen, reportes, recomendaciones básicas (Épica 8.2) |
| [40-cuenta-regresiva-y-cierre-automatico.md](40-cuenta-regresiva-y-cierre-automatico.md) | Cuenta regresiva y cierre automático de lotes: `Timer Service`, los nueve eventos, extensión anti-sniping síncrona, `TimerExpiryScheduler`, adjudicación automática (Épica 8, implementa ADR-007) |
| [41-gestion-post-remate.md](41-gestion-post-remate.md) | Gestión Post-Remate: `PostAuction Service` desacoplado vía eventos, flujo de 8 estados, línea de tiempo, `Notification Service` nuevo (Épica 7, Módulo 7.5) |
| [adr/](adr/) | Registro de decisiones de arquitectura (ADR), una por decisión relevante |

## Reglas de esta documentación (aplican a todas las fases futuras)

1. Ningún código se escribe sin que el diseño correspondiente esté documentado acá primero.
2. Toda decisión con ventajas/desventajas se registra como ADR en `adr/`, incluyendo las
   alternativas descartadas y por qué.
3. Los ADR no se editan retroactivamente. Si una decisión cambia, se crea un ADR nuevo que
   **supersede** al anterior, y ambos quedan enlazados entre sí.
4. Las secciones marcadas como "fuera de alcance del MVP" no se implementan hasta que el
   roadmap ([13-mvp-y-roadmap.md](13-mvp-y-roadmap.md)) lo indique explícitamente.
5. Si una fase futura descubre que algo de esta documentación ya no es cierto (por ejemplo,
   un estado que en la práctica necesitó dividirse), se corrige acá antes de seguir.

## Trazabilidad con el pedido original

| # | Pedido | Dónde está |
|---|---|---|
| 1 | Descripción completa del proyecto | 01 |
| 2 | Objetivos funcionales | 01 |
| 3 | Objetivos técnicos | 01 |
| 4 | Casos de uso | 02 |
| 5 | Requisitos funcionales | 03 |
| 6 | Requisitos no funcionales | 04 |
| 7 | Roles del sistema | 02 |
| 8 | Flujo completo de negocio | 05 |
| 9 | Eventos importantes del sistema | 06 |
| 10 | Estados de un remate | 07 |
| 11 | Estados de un lote | 07 |
| 12 | Estados de una oferta | 07 |
| 13 | Riesgos técnicos | 08 |
| 14 | Decisiones de arquitectura | 09 + `adr/` |
| 15 | Justificación de tecnologías | 12 |
| 16 | Funcionalidades del MVP | 13 |
| 17 | Funcionalidades futuras (roadmap) | 13 |
| 18 | Diagrama de módulos | 10 |
| 19 | Diagrama del flujo principal | 10 |
| 20 | Glosario | 11 |

## Historial de fases

- **Fase 0** (2026-07-13): Diseño completo del sistema — este set de documentos.
- **Fase 1** (2026-07-13): Base técnica del backend — config, logging, DB, Alembic,
  auth JWT, usuarios y roles, Docker. ADR-010 y ADR-011.
- **Épica 2, Módulo 2.1** (2026-07-13): Modelo de Remate — CRUD, permisos, ciclo de vida
  (sin Lotes todavía). Ver [14-modulo-remate.md](14-modulo-remate.md), ADR-012 y ADR-013.
- **Épica 2, Módulo 2.2** (2026-07-14): Modelo de Lote — CRUD completo, permisos,
  reordenamiento, sin lógica de subasta (no abre/cierra lotes, no hay ofertas). Ver
  [15-modulo-lote.md](15-modulo-lote.md), ADR-014 a ADR-017.
- **Épica 2, Módulo 2.3** (2026-07-14): Motor de Estados — iniciar/pausar/reanudar/
  finalizar un remate; abrir/cerrar/cancelar un lote y pasar al siguiente; finalización
  automática (RF-10); todavía sin ofertas, WebSockets ni tiempo real. Ver
  [16-motor-de-estados.md](16-motor-de-estados.md), ADR-018 y ADR-019.
- **Épica 2.4** (2026-07-15): Auction Engine — entidad `Oferta`, recepción/validación/
  aceptación/rechazo de ofertas con concurrencia segura (lock de fila, ADR-004),
  idempotencia, historial inmutable; todavía por HTTP, sin WebSockets ni Redis. Ver
  [17-auction-engine.md](17-auction-engine.md), ADR-020.
- **Épica 3, Módulo 3.1** (2026-07-16): Integración de Redis — cliente compartido vía
  `lifespan`, health check, capas de cache/pub-sub/streams/locks preparadas y probadas,
  sin ningún consumidor de dominio todavía. Ver
  [18-integracion-redis.md](18-integracion-redis.md), ADR-021.
- **Épica 3, Módulo 3.2** (2026-07-17): Arquitectura de Eventos — catálogo de eventos
  tipados (Pydantic), Event Bus interno (`Protocol`) sobre Redis Pub/Sub, un canal por
  remate, `RemateService`/`LoteService`/`AuctionEngine` publican sin conocer
  consumidores; todavía sin ningún consumidor real. Ver
  [19-arquitectura-de-eventos.md](19-arquitectura-de-eventos.md), ADR-022.
- **Épica 3, Módulo 3.3** (2026-07-18): Gateway WebSocket — endpoint `/api/v1/ws`,
  autenticación con el JWT existente en el primer mensaje (ADR-006, implementada por
  primera vez), heartbeat aplicativo (ping/pong de mensaje), `ConnectionManager` en
  memoria por instancia; todavía sin salas ni broadcast de eventos de dominio a
  clientes conectados. Ver
  [20-gateway-websocket.md](20-gateway-websocket.md), ADR-023.
- **Épica 3, Módulo 3.4** (2026-07-19): Sistema de Salas — `RoomManager` en memoria,
  agrupa conexiones por remate (`join_room`/`leave_room`), una sala por conexión,
  eliminación automática de salas vacías; todavía sin broadcast de eventos de dominio a
  las salas. Ver [21-sistema-de-salas.md](21-sistema-de-salas.md), ADR-024.
- **Épica 3, Módulo 3.5** (2026-07-20): Sincronización de eventos en tiempo real —
  `EventConsumer` (`app/realtime/`) escucha Redis Pub/Sub por patrón, interpreta cada
  evento contra una whitelist explícita, y lo entrega únicamente a las conexiones de la
  sala del remate correspondiente; cero cambios en el dominio, el Auction Engine, el
  Gateway, el Room Manager o el Event Bus. Ver
  [22-sincronizacion-tiempo-real.md](22-sincronizacion-tiempo-real.md), ADR-025.
- **Épica 3, Módulo 3.6** (2026-07-21): Snapshot Service — `app/snapshot/` reconstruye
  el estado completo de un remate (info, lote activo, oferta ganadora, historial
  reciente, conectados) para un cliente que entra a mitad de un remate en vivo (RF-16,
  ADR-008 implementado por primera vez); reutilizable por HTTP y WebSocket; el Gateway
  lo usa únicamente al entrar a una sala; cero cambios en el dominio, el Auction
  Engine, el Event Bus, Redis, el Gateway (salvo el punto de integración), el Room
  Manager o el Event Consumer. Ver [23-snapshot-service.md](23-snapshot-service.md),
  ADR-026.
- **Épica 4, Módulo 4.1** (2026-07-22): Fundación del Frontend — React + Vite +
  TypeScript, estructura por dominio (`features/`/`shared/`/`app/`), React Router con
  guards de autenticación y de rol anidados, cliente Axios centralizado con JWT
  automático y refresh transparente (cola single-flight), Zustand para estado
  compartido, Tailwind v4, componentes base; cero cambios en el backend. Ver
  [24-fundacion-frontend.md](24-fundacion-frontend.md), ADR-027.
- **Épica 4, Módulo 4.3** (2026-07-23): Dashboard del Comprador — primera pantalla de
  producto real: listado de remates visibles para un `comprador`, en tarjetas
  responsive, con búsqueda por título (client-side, el backend no expone búsqueda de
  texto), filtro por estado/categoría, orden (próximos/recientes/en vivo), estados de
  carga/vacío/error; sin sala del remate, WebSockets, ofertas, chat ni video (módulos
  futuros); cero cambios en el backend ni en la autenticación. Ver
  [25-dashboard-comprador.md](25-dashboard-comprador.md), ADR-028.
- **Épica 4, Módulo 4.4** (2026-07-24): Página de Detalle del Remate — toda la
  información de un remate puntual (portada, estado, fecha, categoría, descripción,
  ubicación, rematador, cantidad de lotes) más el listado completo de sus lotes, en
  tarjetas; breadcrumb de navegación; botón "Entrar al remate" a un placeholder de la
  sala en vivo, ahora en su propia ruta (`/remates/:remateId/sala`); dos fuentes de
  datos con carga/error independientes (remate y lotes); sin WebSockets, ofertas, chat,
  video ni tiempo real (módulos futuros); cero cambios en el backend ni en la
  autenticación. Ver [26-detalle-remate.md](26-detalle-remate.md), ADR-029.
- **Épica 4, Módulo 4.5** (2026-07-25): Sala del Remate (versión inicial) — pantalla
  principal de un remate en vivo resuelta enteramente con el Snapshot Service ya
  existente (Épica 3.6), sin WebSockets todavía (pedido explícito); cabecera, lote
  activo (galería, ficha técnica, precio inicial, oferta actual, incremento mínimo),
  panel de ofertas (comprador líder anonimizado, historial reciente), próximos lotes no
  seleccionables, botón "Realizar oferta" deshabilitado; nuevo feature
  `features/sala/`, espejando el límite de módulo del `app/snapshot/` del backend;
  arquitectura preparada para WebSockets sin reestructurar (props tipadas, sin código
  simulado); cero cambios en el backend ni en la autenticación. Ver
  [27-sala-del-remate.md](27-sala-del-remate.md), ADR-030.
- **Épica 4, Módulo 4.6** (2026-07-26): Integración WebSocket y actualización en tiempo
  real — cliente WebSocket reutilizable (`shared/websocket/client.ts`): auth en el
  primer mensaje, heartbeat, reconexión con backoff exponencial, salas, cierre limpio;
  los 12 eventos de dominio ya sincronizados por el backend, aplicados de forma
  incremental sobre el snapshot en memoria (nunca se recarga la pantalla completa);
  snapshot recibido también por WebSocket tras `join_room`, que reconcilia
  automáticamente cualquier evento perdido en una reconexión; indicadores visuales de
  conexión; arquitectura preparada para Chat/Presencia/Notificaciones/Streaming sin
  modificar el servicio WebSocket; cero cambios en el backend ni en la autenticación. Ver
  [28-websocket-tiempo-real-sala.md](28-websocket-tiempo-real-sala.md), ADR-031.
- **Épica 5, Módulo 5.1** (2026-07-27): Dashboard del Rematador -- consola de tarjetas
  con los remates propios del rematador autenticado, en cualquier estado; indicadores
  operativos por tarjeta (lotes, conectados si disponible, lote activo/próximo);
  acciones de ciclo de vida (iniciar/reanudar/finalizar, motor de estados de la Épica
  2.3); buscador/filtro (incluido `draft`)/orden reusando la infraestructura del
  dashboard del comprador (Épica 4.3); fila de indicadores tipo consola, sin tablas;
  ruta placeholder para la Consola Operativa del Rematador (Módulo 5.2); cero cambios en
  el backend, la autenticación ni la Sala del Remate del comprador. Ver
  [29-dashboard-rematador.md](29-dashboard-rematador.md), ADR-032.
- **Épica 5, Módulo 5.2** (2026-07-28): Consola Operativa del Rematador -- pantalla de
  control de un remate en vivo: cabecera (estado, tiempo transcurrido, conectados,
  indicador de conexión), panel principal con el lote activo, panel de control con las
  seis acciones del motor de estados (abrir lote, pasar al siguiente, cerrar lote,
  pausar, reanudar, finalizar), panel de ofertas en tiempo real con la última oferta
  destacada, panel de próximos lotes seleccionable; reutiliza tal cual
  `useLiveRemateState`/`ImageGallery`/`ConnectionStatusBadge` de la Épica 4.6, sin
  modificarlos; reemplaza el placeholder de "Administrar" de la Épica 5.1 sin tocar el
  árbol de rutas; cero cambios en el backend, la autenticación ni `features/sala/`. Ver
  [30-consola-operativa-rematador.md](30-consola-operativa-rematador.md), ADR-033.
- **Épica 5, Módulo 5.3** (2026-07-29): Gestión completa de Remates y Lotes -- pantalla
  de preparación de un remate (`/remates/:remateId/lotes`, reemplaza el placeholder de la
  Épica 5.1): crear/editar/eliminar/duplicar/publicar/cancelar el remate desde una
  sidebar, y crear/editar/eliminar/duplicar/reordenar sus lotes en tarjetas; "programar"/
  "publicar" consolidados en una sola acción (una única transición de backend);
  "duplicar" compuesto en el cliente (GET + POST) porque no hay endpoint para eso;
  reordenamiento con HTML5 Drag and Drop nativo (actualización optimista con
  revert-on-error) y botones ↑/↓ como mecanismo siempre disponible, no cosmético; cinco
  componentes genéricos nuevos en `shared/components/` (`Modal`, `ConfirmModal`,
  `Textarea`, `Select`, `DropdownMenu`); reutiliza `useRemateDetail`/`useLotes` de la
  Épica 4.4 sin modificarlos; cero cambios en el backend ni en la autenticación. Ver
  [31-gestion-remates-lotes.md](31-gestion-remates-lotes.md), ADR-034.
- **Épica 6, Módulo 6.1** (2026-07-30): Gestión multimedia de los lotes -- galería
  completa de imágenes embebida en el formulario de Lote (modo edición): subida múltiple
  en paralelo con barra de progreso, vista previa antes de terminar de subir, selección
  de imagen principal, reordenamiento (drag & drop nativo + flechas de fallback),
  eliminación con confirmación, validación de formato/tamaño espejada en cliente y
  servidor; único endpoint de backend nuevo de todo el proyecto en esta fase,
  `POST .../lotes/{id}/images` (multipart, disco local, `StaticFiles`), documentado como
  brecha antes de implementarlo (instrucción explícita del enunciado) -- el array
  `images` se sigue persistiendo con el `PATCH` de Lote ya existente desde la Épica 2.2;
  dos componentes genéricos nuevos (`Dropzone`, `ProgressBar`) sin ningún conocimiento de
  imágenes, reutilizables por video/PDF/certificados a futuro (`Lote.documents`, ya
  existente, sin consumidor todavía) sin rediseñar. Ver
  [32-gestion-multimedia-lotes.md](32-gestion-multimedia-lotes.md), ADR-035.
- **Épica 6, Módulo 6.2** (2026-07-31): Sistema de presencia de usuarios --
  `PresenceService` (`app/presence/`) centraliza join/leave de sala y publica
  `presencia.usuario_conectado`/`presencia.usuario_desconectado` (ya reservados desde
  Fase 0) sobre el Event Bus existente, reutilizando el pipeline de sincronización de la
  Épica 3 sin tocar `RoomManager`/`ConnectionManager`/`EventDispatcher`/`EventConsumer`;
  `RemateStateSnapshot` gana `connected_users_detail` (enmascarado igual que
  `reserve_price`/`buyer_id`, Épica 3.6); `GET /presence/global` para el conteo agregado
  de toda la plataforma; frontend: `PresenceCounter` (nuevo, reemplaza el contador
  estático duplicado en `SalaHeader`/`ConsolaHeader`) y `ConnectedUsersList` (nuevo, solo
  en la Consola Operativa) se actualizan evento a evento vía el reducer ya existente
  (Épica 4.6), indexado por `connection_id` para soportar múltiples pestañas del mismo
  usuario; indicador de actividad del remate reforzando el badge de estado ya existente,
  sin dato ni componente nuevo; cero cambios en el dominio, el Auction Engine ni la
  autenticación. Ver [33-sistema-de-presencia.md](33-sistema-de-presencia.md), ADR-036.
- **Épica 6, Módulo 6.4** (2026-08-01): Chat del remate -- módulo de dominio nuevo
  (`app/modules/chat/`, distinto de la infraestructura transversal de
  `presence`/`snapshot`) para envío/historial (paginación keyset)/moderación
  (soft-delete, solo el dueño del remate) de mensajes; `ChatMessageSent`/
  `ChatMessageDeleted`/`ChatUserTyping` sincronizados por el mismo pipeline de eventos
  de la Épica 3 (`SYNCED_EVENTS`); mensajes automáticos de sistema del ciclo de vida
  del remate generados por un segundo `EventConsumer` independiente
  (`ChatSystemEventDispatcher`), idempotente vía `source_event_id` + índice único
  parcial para despliegues multi-instancia; `EventConsumer.dispatcher` generalizado a
  un `Protocol` estructural para admitir ese segundo consumidor, sin cambiar su
  comportamiento; rate limiting básico (`RedisRateLimiter`, nuevo, infraestructura
  genérica) sobre mensajes y aviso de "está escribiendo"; frontend:
  `subscribeToRealtime` (nuevo en `useLiveRemateState`) comparte la única conexión
  WebSocket de la página con el feature `chat/`, sin duplicar el contador de
  Presencia; `ChatPanel` integrado en la Sala del Remate (comprador) y la Consola
  Operativa (rematador, con moderación); scroll preservado al leer mensajes
  anteriores, auto-scroll al último mensaje; cero cambios en el Gateway WebSocket,
  `RoomManager`, `ConnectionManager`, `EventDispatcher`, `app/presence/`,
  `app/snapshot/` ni el dominio de remates/ofertas. Ver
  [34-chat-del-remate.md](34-chat-del-remate.md), ADR-037.
- **Épica 7, Módulo 7.1** (2026-08-02): Dashboard de analítica en tiempo real --
  paquete transversal nuevo (`app/analytics/`, sin modelo propio, mismo nivel que
  `presence`/`snapshot`) 100% de lectura: cada métrica pedida (conectados, ofertas por
  minuto, total de ofertas, lotes vendidos/restantes, tiempo promedio por lote, valor
  adjudicado, oferta más alta, lote con más ofertas) es una consulta agregada de
  Postgres sobre columnas ya persistidas desde las Épicas 2.2-2.4, sin eventos de
  dominio nuevos ni consumidor propio (contraste explícito con Chat, que sí necesitó
  ambos); control de acceso propio -- deniega con 403 (no enmascara) a quien no sea
  dueño ni admin; caché Redis corta (3s) sobre los agregados, nunca sobre los conteos
  de Presencia; frontend: `useRemateAnalytics` dispara un refetch HTTP debounced
  (~1.2s) ante eventos de dominio relevantes en vez de un reducer incremental,
  reutilizando `subscribeToRealtime` (Módulo 6.4) sin abrir una segunda conexión;
  `BidsTimelineChart`/`EventsTimeline` (SVG/HTML a mano, sin librería nueva) integrados
  en la Consola Operativa del rematador; cero cambios en `app/realtime/`, el Gateway
  WebSocket, `app/presence/`, `app/snapshot/` ni el dominio de remates/lotes/ofertas.
  Ver [35-dashboard-analitica-tiempo-real.md](35-dashboard-analitica-tiempo-real.md),
  ADR-038.
- **Épica 7, Módulo 7.2** (2026-08-03): Sistema de Auditoría y Trazabilidad -- Audit
  Service centralizado (`app/audit/`, paquete transversal nuevo que, a diferencia de
  Analítica, sí persiste) para login/logout, CRUD y cambios de estado de remates,
  CRUD/apertura/cierre/adjudicación de lotes, ofertas realizadas/rechazadas, mensajes
  de chat eliminados y cambios de `Remate.settings`; escritura llamada directo desde
  cinco servicios de dominio existentes (`AuthService`/`RemateService`/`LoteService`/
  `AuctionEngine`/`ChatService`), síncrona y en la misma transacción de la acción que
  audita -- nunca vía el Event Bus (best-effort por diseño, incompatible con "nunca
  perder un registro"); `action` como namespace de string abierto, no un `Enum` nativo
  de Postgres, para extender el catálogo sin migraciones; `AuditLogRepository`
  (escritura) separado de `AuditService` (lectura del panel) para evitar un ciclo de
  imports con `RemateService`, mismo criterio que ADR-019; control de acceso admin
  (global) / dueño-o-admin (scoped a un remate); frontend: `features/audit/`, un único
  componente (`AuditLogView`) para el panel global del admin (`/admin`, reemplaza el
  placeholder de la Épica 4.1) y el panel scoped del rematador
  (`/remates/:id/auditoria`, nuevo), tarjetas agrupadas por día, sin tabla, sin tiempo
  real (log histórico); cero cambios en `app/realtime/`, el Gateway WebSocket,
  `app/presence/`, `app/snapshot/` ni ninguna regla de negocio existente de
  remates/lotes/ofertas/chat. Ver
  [36-sistema-de-auditoria-y-trazabilidad.md](36-sistema-de-auditoria-y-trazabilidad.md),
  ADR-039.
- **Épica 7, Módulo 7.3** (2026-08-04): Historial y Resultados de Remates -- History
  Service (`app/history/`, paquete transversal nuevo, sin modelo propio) para consultar
  remates finalizados/cancelados: listado con KPIs agregados (lotes, vendidos, monto
  adjudicado, compradores, duración), detalle por remate (métricas finales, línea de
  tiempo, actividad de chat, participantes) y detalle por lote (ganador, precios,
  historial de ofertas); reutilización real de Analítica (`AnalyticsRepository`
  inyectado directo, no `AnalyticsService`, para las mismas cuatro consultas del panel
  en vivo; `HighestOferta.from_row`/`TopLoteByOffers.from_row` nuevos en
  `app/analytics/schemas.py` comparten el mapeo `Row -> DTO`) y de Auditoría
  (`AuditLogView` embebido tal cual en el frontend para la línea de tiempo, cero código
  de backend nuevo); listado agregado con dos subconsultas `GROUP BY` en vez de un join
  triple (evita fan-out); `participants_count` como aproximación documentada
  (Presencia no persiste historial, ADR-009); control de acceso dueño-o-admin + remate
  en estado terminal; preparación arquitectónica (no construida) para exportación a
  PDF/Excel; frontend: `features/history/`, pestaña "Historial" nueva en `/admin`,
  ruta `/historial` para el rematador; cero cambios en `app/realtime/`, el Gateway
  WebSocket, `app/presence/`, `app/snapshot/`, `app/audit/` ni el dominio de
  remates/lotes/ofertas/chat. Ver
  [37-historial-y-resultados-de-remates.md](37-historial-y-resultados-de-remates.md),
  ADR-040.
- **Épica 8, Módulo 8.1** (2026-08-05): Observabilidad y Monitoreo -- primera fase
  puramente de infraestructura, cero funcionalidad de negocio nueva. Monitoring
  Service (`app/monitoring/`, paquete transversal nuevo, sin modelo propio):
  `GET /monitoring/health` (público: API/PostgreSQL/Redis/WebSocket, sin tocar el
  `/health` ya existente) y `GET /monitoring/metrics` (admin: conectados/WebSockets
  activos vía `ConnectionManager`, mensajes de chat/ofertas por minuto vía consultas
  globales nuevas a Postgres, timings promedio y errores recientes vía
  `RedisMetricsRecorder` nuevo -- mismo patrón fixed-window por minuto que
  `RedisRateLimiter` --, memoria/CPU del proceso vía `psutil`, dependencia nueva);
  instrumentación de timing deliberadamente no invasiva -- el router de ofertas
  envuelve `AuctionEngine.place_bid(...)` con un timer sin tocar el motor,
  `RequestContextMiddleware` gana una línea additiva sobre `duration_ms` que ya
  calculaba, todo best-effort; cuatro logs nuevos de ciclo de vida del proceso
  (`app_starting`/`app_started`/`app_shutting_down`/`app_stopped`); memoria/CPU por
  proceso, no por host (ADR-001, despliegue multi-instancia); preparación
  arquitectónica (no construida) para Prometheus/Grafana; frontend:
  `features/monitoring/`, tercera pestaña "Monitoreo" en `/admin` con polling cada
  10s, `MetricsGrid` reutiliza `KpiCard` de Analítica; cero cambios en
  `AuctionEngine`, `RemateService`, `LoteService`, `ChatService`, `AuthService`,
  `app/realtime/`, `app/presence/`, `app/snapshot/`, `app/audit/`, `app/analytics/`
  ni `app/history/`. Ver
  [38-observabilidad-y-monitoreo.md](38-observabilidad-y-monitoreo.md), ADR-041.
- **Épica 8, Módulo 8.2** (2026-07-22): Pruebas de Carga y Rendimiento -- segunda fase
  puramente de infraestructura, cero funcionalidad de negocio nueva, y la primera que
  vive fuera de `backend/`/`frontend/`: un entorno de carga propio (`loadtest/`,
  proyecto Python independiente, venv/dependencias propias --
  `httpx`/`websockets`/`matplotlib`/`jinja2` -- ninguna tocó el `pyproject.toml` del
  backend) que reimplementa el protocolo del Gateway WebSocket (`docs/20`) desde su
  documentación pública, sin importar un solo símbolo de `app/websocket/`. Cinco
  escenarios parametrizables: `connected_buyers` (100/500/1000 compradores
  conectados, RNF-04), `concurrent_remates` (múltiples remates `LIVE` simultáneos,
  RNF-06), `bid_storm` (miles de ofertas consecutivas, stress del `SELECT FOR UPDATE`
  del Auction Engine, ADR-004), `chat_concurrency` (chat a alta frecuencia respetando
  el rate limiting existente) y `notifications_broadcast` (latencia de difusión de un
  evento de dominio a N clientes, valida RNF-01 directamente). Las métricas de
  servidor (CPU/memoria/conectados/timings) no se instrumentaron de nuevo: un
  `MonitoringPoller` reutiliza `GET /monitoring/metrics` del Módulo 8.1 durante cada
  corrida, best-effort (si el login de admin falla, la corrida sigue sin esa serie).
  Seed de datos (compradores/rematador/remates/lotes `LIVE`+`OPEN`) exclusivamente
  vía la API pública, cero acceso directo a la base. Cada corrida genera
  `summary.json` + `report.html` autocontenido (gráficos como PNG embebidos vía
  matplotlib, sin servidor) con un motor de recomendaciones básico contra los
  umbrales de RNF-01/02/04; `loadtest compare` genera `comparison.html` entre
  corridas; cero cambios en `backend/app`/`frontend/src`. Ver
  [39-pruebas-de-carga-y-rendimiento.md](39-pruebas-de-carga-y-rendimiento.md),
  ADR-042, y [loadtest/README.md](../loadtest/README.md) para la guía de ejecución.
- **Épica 8** (2026-07-23): Cuenta Regresiva y Cierre Automático de Lotes -- implementa
  por primera vez [ADR-007](adr/ADR-007-anti-sniping.md) (Fase 0, anti-sniping
  completo, nunca construido). Timer Service nuevo (`app/timer/`, paquete
  transversal top-level, sin modelo propio -- tres columnas nuevas en `Lote`:
  `timer_ends_at`/`timer_paused_remaining_seconds`/`timer_auto_close_enabled`, nunca
  las dos primeras no-`None` a la vez, sin un `PAUSED` nuevo en `LoteStatus`).
  Arranque del timer (`LoteService.open`/`open_next`) y extensión anti-sniping
  (`AuctionEngine.place_bid`) son llamadas síncronas a `@staticmethod`s puros de
  `TimerService` -- deliberadamente no vía el Event Bus, para que
  `TimerExpiryScheduler` nunca pueda cerrar el lote en la misma ventana en que una
  extensión asíncrona todavía no se aplicó (mismo razonamiento que ya descartó el
  Event Bus para auditoría, ADR-039). `TimerExpiryScheduler` (tarea de fondo nueva,
  mismo patrón que `EventConsumer`/`ChatSystemEventDispatcher`) sondea cada 1s y
  reusa el lock de fila de ADR-004 (`get_by_id_for_update`, primera vez usado por
  algo distinto del Auction Engine) para serializarse contra un bid o una acción del
  rematador en curso, y respeta la pausa del remate (no adjudica mientras nadie
  puede ofertar). `LoteService.close()` se refactorizó (`_apply_close` privado)
  sin cambiar su firma ni comportamiento externo; el nuevo `auto_close()` lo reusa
  para la adjudicación automática (`lote.winner_determined`, implementa
  `lote.ganador_determinado` reservado desde Fase 0), auditada con `actor_id=None`
  (mismo patrón que `RemateService.try_auto_finish`). Nueve eventos de dominio
  nuevos, sincronizados por el pipeline ya existente (`app/realtime/registry.py`)
  sin tocar `app/websocket/`/`app/realtime/consumer.py`/`dispatcher.py`. Cinco
  acciones nuevas del rematador (pausar/reanudar/reiniciar/fijar tiempo restante/
  alternar cierre automático, `app/timer/router.py`, montado sin tocar
  `lotes/router.py`, mismo criterio que `snapshot_router`). Frontend:
  `LoteCountdown.tsx` (Sala del comprador y Consola del rematador) recibe el
  deadline absoluto del backend y solo recalcula localmente para el tictac visual
  -- el backend decide exclusivamente cuándo cerrar; cinco controles nuevos en
  `ConsolaControlPanel.tsx`; toast de adjudicación en `SalaPage.tsx`. Cero cambios
  en la lógica de aceptación/rechazo de ofertas del Auction Engine, en
  `app/websocket/`, `app/realtime/consumer.py`/`dispatcher.py`. Ver
  [40-cuenta-regresiva-y-cierre-automatico.md](40-cuenta-regresiva-y-cierre-automatico.md),
  ADR-043.
- **Épica 7, Módulo 7.5** (2026-07-23): Gestión Post-Remate -- PostAuction Service
  desacoplado (`app/postauction/`, paquete transversal nuevo, mismo nivel que
  `app/audit/`/`app/history/`/`app/monitoring/`) que reacciona a `lote.winner_determined`
  con su propia (tercera) instancia de `EventConsumer`
  (`PostAuctionEventDispatcher`, mismo patrón que `ChatSystemEventDispatcher`) --
  `app/modules/remates/lotes/service.py` no gana un solo import nuevo, garantía
  verificada por dos tests nuevos en `test_architecture_boundaries.py`. Flujo de ocho
  estados (Adjudicado → Pendiente de contacto → Pago pendiente → Pago recibido →
  Preparando entrega → Enviado → Entregado → Finalizado), máquina de estados
  forward-only con saltos permitidos (`ALLOWED_TRANSITIONS` derivado de una lista
  ordenada, no una tabla de transiciones puntuales como `LoteStatus`); un único
  endpoint de cambio de estado cubre también "registrar fecha de contacto/pago/envío/
  entrega" (la fecha hito se estampa según a qué estado se llega,
  `STATUS_MILESTONE_FIELD`). Línea de tiempo propia insert-only
  (`PostAuctionTimelineEntry`, `case_id` en `CASCADE`) -- no reutiliza Historial (no
  tiene escritura) ni Auditoría (transversal a toda la plataforma, no específico de un
  caso). El enunciado pedía reutilizar un "Notification Service" que, verificado
  explícitamente, no existía -- se construyó una versión mínima y genérica
  (`app/notifications/`, sin `service.py`, sin conocer a `postauction` ni a ningún otro
  módulo de dominio) que persiste en la misma transacción que la mutación que la
  origina (mismo criterio que `AuditLogRepository.record`), disparada en los cuatro
  momentos pedidos (adjudicación, cambio de estado, pago, entrega); los eventos del
  módulo también se sincronizan por el pipeline de WebSocket existente si el usuario ya
  está en la sala del remate. "Ventas adjudicadas" (rematador, buscar/filtrar por
  estado) y "Mis compras" (comprador) en `features/postauction/`, con un indicador
  visual de progreso (`ProgressStepper`) y una línea de tiempo (`Timeline`) compartidos;
  botones de entrada nuevos en ambos dashboards. Limitación documentada: el cierre
  manual de un lote vendido (ADR-018) no genera un caso automático, al no haber
  comprador asociado en ese flujo. Cero cambios en `AuctionEngine`, `RemateService`,
  `LoteService`, `app/websocket/`, `app/snapshot/`, `app/audit/service.py`. Ver
  [41-gestion-post-remate.md](41-gestion-post-remate.md), ADR-044.
