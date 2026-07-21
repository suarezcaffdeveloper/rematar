# ADR-038: Dashboard de Analítica en Tiempo Real — 100% derivado de Postgres, sin persistencia ni consumidor propio

- **Fecha**: 2026-08-02
- **Estado**: Aceptada

## Contexto

El rematador necesita un panel de métricas en vivo para monitorear un remate mientras
se desarrolla: compradores conectados, ritmo de ofertas, lotes vendidos/restantes,
valor adjudicado, oferta más alta, lote más disputado, evolución de ofertas y una línea
de tiempo de eventos relevantes. El enunciado pide un "Analytics Service desacoplado",
reutilizar la infraestructura ya construida (Postgres, Redis, Event Bus, WebSockets,
Presence Service), y evitar recargar la página completa al actualizar.

A diferencia del Chat (Módulo 6.4, ADR-037), que necesitó un segundo `EventConsumer`
porque **persiste datos nuevos** (mensajes) derivados de eventos de ciclo de vida, este
módulo no persiste absolutamente nada propio: cada métrica pedida es calculable, en el
momento, a partir de columnas que ya existen desde las Épicas 2.2-2.4
(`Lote.opened_at`/`closed_at`/`final_price`, `Oferta.created_at`/`amount`/`status`).
Este ADR registra las decisiones de diseño que se derivan de esa diferencia.

## Decisión

### A. 100% derivado de Postgres, sin eventos de dominio nuevos, sin consumidor propio

`AnalyticsService.build(remate_id, viewer)` es el único método público, y es enteramente
de lectura: compone `RemateService` (visibilidad/control de acceso) +
`AnalyticsRepository` (agregados de Postgres) + `PresenceService` (conteo de
conectados) — mismo patrón "compositor sobre infraestructura existente" que
`SnapshotService`/`PresenceService`. No se agrega ningún evento de dominio nuevo a
`app/realtime/registry.py`, no se instancia un segundo `EventConsumer` (a diferencia de
`ChatSystemEventDispatcher`, ADR-037 sección D) — no hay nada que idempotizar porque no
hay ninguna escritura que un despliegue multi-instancia pudiera duplicar. Este es el
contraste central con Chat: la complejidad que Chat necesitó (idempotencia vía
`source_event_id`, un segundo consumidor, `session_factory` inyectable para tareas de
fondo) existe únicamente porque Chat escribe filas nuevas; Analítica nunca escribe
nada, así que ninguna de esas piezas aplica acá.

### B. Agregación vía `JOIN Oferta -> Lote`, sin denormalizar `remate_id` en `Oferta`

`Oferta` no tiene `remate_id` propio (solo `lote_id`); toda métrica que agrega "las
ofertas de este remate" hace `JOIN lotes` sobre `Lote.remate_id` (indexado,
`index=True` desde la Épica 2.2) y `ix_ofertas_lote_id_created_at` (Épica 2.4). Se
descartó denormalizar `remate_id` en `Oferta` (una columna nueva + backfill + índice
nuevo en una tabla que además tiene `RF-25`, "registro inmutable de toda oferta
recibida" — modificar su forma es un cambio no trivial) porque el plan de consulta real
es: index scan sobre `lotes(remate_id)` para obtener el conjunto de lotes del remate
(acotado — RF-08 nunca produce catálogos sin límite, decenas o cientos de lotes, no
miles) seguido de un join indexado hacia `ofertas`. A esta escala, el costo del join es
insignificante comparado con el costo de una migración sobre una tabla de auditoría
inmutable. Si algún día el dominio cambiara para permitir catálogos de lotes sin
límite, esta decisión debería revisitarse — no es el caso hoy.

### C. Denegar (403), no enmascarar — diverge deliberadamente de `SnapshotService`

`SnapshotService` nunca deniega: degrada por campo (`reserve_price`/`buyer_id`
enmascarados) y siempre devuelve `200`. Analítica no tiene una vista parcial con
sentido para un comprador ajeno — cada dato que expone (dinero, cantidad de ofertas,
promedios) es, en su totalidad, información de negocio privada del rematador. Por eso
`AnalyticsService.build`:

1. Reusa `RemateService.get_visible_or_raise` (no `get_owned_or_raise`, que excluye
   admin y está pensado para escrituras) — mismo 404-oculta-borradores que cualquier
   otra lectura.
2. Si el remate es visible pero el viewer no es dueño ni admin, levanta
   `ForbiddenError` (403) — `_is_privileged` (owner o admin) se reimplementa
   localmente, mismo criterio de "una línea, no vale la pena compartirla entre
   módulos" que ya estableció `SnapshotService._is_privileged` (ADR-026 sección D).

Un 403 acá no filtra información nueva: para cualquier remate no-`DRAFT` (el único
estado donde este panel tiene sentido — no se opera analítica sobre un borrador) la
existencia del remate ya es pública (aparece en listados). El admin puede ver
analítica de cualquier remate — coherente con "acceso a métricas y auditoría
globales" (`docs/02-roles-y-casos-de-uso.md`).

### D. Refetch HTTP debounced, no un reducer incremental por campo

`useRemateAnalytics` (frontend) hace un fetch inicial y luego, ante cualquier evento de
dominio relevante recibido por `subscribeToRealtime` (`remate.*`/`lote.*`/`oferta.*`/
`presencia.*`, o el mensaje `type: 'snapshot'` de reconciliación), dispara un
**refetch debounced** (trailing edge, ~1200ms) que reemplaza el estado completo — nunca
aplica el payload del evento como un parche incremental sobre campos individuales.

Se descartó un reducer incremental (como el que `features/sala/realtime/reducer.ts` ya
usa para el snapshot principal) porque varias métricas no son una función pura de
`(valor previo, un evento)`: una tasa en ventana de tiempo (ofertas por minuto), un
promedio (tiempo por lote), un conteo filtrado por un dato que el evento no trae (rol
del usuario conectado/desconectado — los eventos de presencia solo traen `user_id`,
no rol), o un "top N" (lote con más ofertas) requieren, para ser exactos, o bien
recalcular sobre el estado completo o bien mantener una estructura de agregación
paralela del lado del cliente — ambas opciones más complejas y con más superficie de
deriva silenciosa que un refetch. Un número ~1.2 segundos viejo es preferible a uno
que puede desincronizarse sin que nadie lo note en una sesión de varias horas.

**Inconsistencia de UX aceptada y documentada, no un descuido**: `PresenceUserConnected`/
`Disconnected` (eventos de presencia) ya traen `connected_users: number` en el propio
payload, así que el badge "Conectados" de `ConsolaHeader` (alimentado por el reducer
existente de la Épica 6.2) se actualiza al instante, evento a evento. La tarjeta KPI
"usuarios activos" del panel de Analítica, en cambio, pasa por el refetch debounced y
queda hasta ~1.2s atrás del badge. Se evaluó parchear ese único campo al instante desde
el propio evento (ya que el dato está disponible) pero se descartó: mezclar "la mayoría
de los campos refetchean, uno se parchea al instante" reintroduce exactamente la
complejidad híbrida que el refetch buscaba evitar, por una inconsistencia cosmética de
poco más de un segundo en una tarjeta secundaria (el badge del header, la fuente
primaria de ese número, no se ve afectado).

### E. Sin librería de gráficos nueva

`BidsTimelineChart` (barras) y `EventsTimeline` (lista) son SVG/HTML a mano, mismo
criterio que cada visual anterior del proyecto (`ImageGallery`, `Dropzone`,
`ProgressBar` — ADR-027, "mantener el árbol de dependencias chico"). Ambos visuales son
lo bastante simples (una serie de ~20 puntos; una lista ordenada) como para no
justificar una dependencia nueva.

### F. La línea de tiempo no puede reconstruir inicio/pausa/reanudación históricos

Dos limitaciones distintas, ambas de origen estructural, no arreglables sin cambiar
decisiones ya tomadas en fases anteriores:

1. No existe un event store durable (ADR-009: Redis Pub/Sub, no Streams, sin historial
   persistido) — cualquier evento que no se pueda re-derivar de una columna persistida
   simplemente no está disponible para nadie, sin importar cuándo se conecte.
2. `Remate` solo persiste `finished_at`/`cancelled_at` (Épica 2.1) — nunca se agregó
   `started_at`/`paused_at`/`resumed_at`, porque el motor de estados (Épica 2.3) solo
   necesitaba el `status` actual para operar, no un historial de transiciones.

Por eso la línea de tiempo reconstruida al cargar el panel solo puede incluir apertura/
cierre de lotes (`opened_at`/`closed_at`, sí persistidos) y fin/cancelación del remate
— inicio, pausa y reanudación son visibles en vivo mientras el panel está conectado
(llegan como eventos de dominio y disparan el refetch de la sección D), pero nunca
aparecen retroactivamente en una carga posterior. Se documenta como limitación
aceptada, no se agregan las tres columnas nuevas a `Remate` solo para este panel —
sería una migración sobre una tabla ya en producción por un beneficio acotado a una
lista secundaria del dashboard.

### G. `PresenceService` inyectado directo en `AnalyticsService`, no compuesto en el router

`snapshot/router.py` recibe `connected_users`/`connected_users_detail` como argumentos
planos de `SnapshotService.build` porque ese servicio se invoca desde **dos**
transportes (HTTP y el Gateway WebSocket, cada uno con su propia forma de obtener el
conteo de conectados — ADR-026 sección C). Analítica tiene un único transporte (HTTP,
nunca se invoca desde el Gateway) — esa razón para desacoplar no aplica, así que
`AnalyticsService` recibe `PresenceService` completo por constructor, resuelto por
`app/analytics/dependencies.py` reusando `app.presence.dependencies.get_presence_service`
tal cual (ya funciona desde un router HTTP plano, lo prueba `snapshot_router`
usándola así). Esto también hace que `app/analytics/dependencies.py` sea más simple que
`snapshot/dependencies.py`: no hace falta el patrón `HTTPConnection` (`_get_cache`/
`_get_event_bus` duplicados) que Snapshot necesita para funcionar desde ambos
transportes.

## Alternativas consideradas

- **Mantener contadores derivados en Redis, actualizados por un consumidor propio**
  (mismo patrón que Chat): descartada — cada métrica pedida es calculable exactamente
  desde Postgres en el momento, así que mantener una copia derivada en Redis solo
  agregaría una superficie nueva de inconsistencia (¿qué pasa si el consumidor se cae
  a mitad de una ráfaga de eventos?) sin ningún beneficio sobre simplemente consultar
  la fuente de verdad con una caché corta.
- **Denormalizar `remate_id` en `Oferta`**: descartada, ver sección B.
- **Enmascarar en vez de denegar (mismo criterio que `SnapshotService`)**: descartada,
  ver sección C — no existe una vista parcial de agregados de negocio que tenga
  sentido mostrarle a un comprador ajeno.
- **Reducer incremental client-side, igual que `reducer.ts`**: descartada, ver sección
  D — el riesgo de deriva silenciosa en varias de las métricas pedidas supera el
  beneficio de evitar ~1.2s de latencia.
- **Agregar `started_at`/`paused_at`/`resumed_at` a `Remate`** para completar la línea
  de tiempo: descartada, ver sección F — migración sobre una tabla en producción por un
  beneficico acotado a un panel secundario.

## Consecuencias

- **Ventajas**: el módulo se integró sin tocar `app/realtime/`, el Gateway WebSocket,
  `RoomManager`/`ConnectionManager`, `app/presence/`, `app/snapshot/` ni el dominio de
  remates/lotes/ofertas — en los hechos, sumar un módulo entero de analítica fue: un
  paquete nuevo (`app/analytics/`) + una línea en `app/api/router.py` + cuatro settings
  nuevas. Ninguna consulta puede desincronizarse de la realidad porque ninguna
  mantiene estado propio — cada respuesta es, en el peor caso (cache miss), una lectura
  fresca de la fuente de verdad.
- **Desventajas aceptadas**: hasta ~1.2s de latencia entre un evento real y su reflejo
  en el panel (sección D); la línea de tiempo no puede mostrar transiciones históricas
  de inicio/pausa/reanudación (sección F); un remate con muchísima actividad simultánea
  generará refetches frecuentes (mitigado por la caché Redis de 3s, que absorbe
  ráfagas dentro de esa ventana).
- Sumar una métrica nueva a futuro es: una consulta en `AnalyticsRepository`, un campo
  en `RemateAnalyticsSnapshot`, una tarjeta en `AnalyticsPanel` — sin reabrir el
  control de acceso, la caché, ni el mecanismo de refetch, que son genéricos sobre
  cualquier campo del snapshot.
