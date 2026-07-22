# ADR-040: Historial y Resultados de Remates — reutilización real de Analytics/Audit, agregación en dos subconsultas, participantes como aproximación

- **Fecha**: 2026-08-04
- **Estado**: Aceptada

## Contexto

El enunciado pide un módulo de historial que muestre los resultados de remates ya
finalizados: un listado con KPIs agregados, un detalle completo por remate y un detalle
por lote, explícitamente pidiendo reutilizar Analytics y Audit "cuando sea posible" y
"evitar duplicar lógica existente", más una arquitectura preparada (no construida) para
exportación de reportes.

A diferencia de Analítica (Módulo 7.1, datos de un remate **en curso**) y Auditoría
(Módulo 7.2, un log de acciones que se escribe en el momento), este módulo es
puramente retrospectivo: todo lo que necesita ya está persistido por fases anteriores,
y el desafío de diseño no es qué calcular sino **qué NO volver a calcular**.

## Decisión

### A. `HistoryService` inyecta `AnalyticsRepository`, no `AnalyticsService`

`AnalyticsService.build` compone `PresenceService` (conteo de conectados **ahora
mismo**) y una caché Redis de TTL corto (3s, pensada para absorber ráfagas de refetch
de un panel que se está mirando en vivo). Ninguna de las dos tiene sentido para un
remate ya `FINISHED`/`CANCELLED`: no hay nadie "conectado ahora" en el sentido que
Presencia mide, y el resultado de una consulta sobre un remate terminado no cambia
nunca más, así que cachearlo con un TTL corto no aporta nada (en todo caso, un TTL
largo o ninguna caché sería más apropiado, pero ni siquiera hace falta: el costo de
recalcular una vez por request es bajo).

`HistoryService.get_detail` llama directo a `AnalyticsRepository.
get_lote_status_aggregates`/`count_total_ofertas`/`get_highest_oferta`/
`get_top_lote_by_offer_count` -- las mismas cuatro consultas SQL que ya alimentan el
panel en vivo, sin ningún acoplamiento a Presencia ni a Redis. Esto es la reutilización
real que pide el enunciado: no "las mismas métricas, recalculadas con el mismo
criterio", sino literalmente las mismas consultas ejecutándose.

Para que el mapeo `Row -> DTO` (`HighestOferta`/`TopLoteByOffers`) tampoco se
duplicara, se movió de método privado de `AnalyticsService`
(`_build_highest_oferta`/`_build_top_lote`) a classmethod del propio schema
(`HighestOferta.from_row`/`TopLoteByOffers.from_row`, `app/analytics/schemas.py`) --
`AnalyticsService` se actualizó para usarlos, con la suite de tests de Analítica
verificando que el comportamiento no cambió un bit.

### B. La línea de tiempo se resuelve embebiendo `AuditLogView`, nunca reimplementada

Se evaluó que `HistoryService.get_detail` llamara a `AuditService.list_for_remate` y
embebiera los eventos dentro de `RemateHistoryDetail`. Se descartó por dos razones:

1. **Import circular potencial evitado a propósito**: `AuditService` ya depende de
   `RemateService`; si `HistoryService` importara `AuditService`, sumaría una capa más
   de composición para un dato que el frontend puede pedir directo sin intermediarios.
2. **El endpoint ya existe y ya tiene su propio componente de UI completo**
   (`AuditLogView`, `features/audit/components/`, con filtros, paginación y timeline
   agrupado por día). Duplicar esos datos en la respuesta de History obligaría a
   reconstruir esa misma UI una segunda vez, o a mantener dos representaciones del
   mismo log sincronizadas.

En cambio, `RemateHistoryDetailPage.tsx` (frontend) embebe `AuditLogView` tal cual con
`scope={{type:'remate', remateId}}` -- mismo componente, mismo endpoint
(`GET /remates/{id}/audit`) que ya usa `/remates/:id/auditoria`. Cero código nuevo,
backend o frontend, para la línea de tiempo. Es la forma más literal de "reutilizar
Audit" que el enunciado pedía.

### C. Listado agregado: dos subconsultas `GROUP BY`, no un join triple

`HistoryRepository.list_finished_summaries` necesita, por remate: cantidad de lotes,
cantidad vendidos, valor total adjudicado, primera apertura/último cierre de lote, y
cantidad de compradores distintos que ofertaron. Un único `SELECT` con
`remates JOIN lotes JOIN ofertas` duplicaría cada fila de `lotes` una vez por cada
oferta asociada (fan-out) -- `SUM(final_price)`/`COUNT(lotes)` quedarían mal por ese
motivo. La solución es la misma que ya usa `AnalyticsRepository.
get_lote_status_aggregates` a nivel de un remate (`FILTER` sobre un único `GROUP BY`
de lotes), extendida acá a dos subconsultas independientes -- una agregando `lotes`
por `remate_id`, otra agregando `ofertas JOIN lotes` por `remate_id` -- unidas con
`LEFT JOIN` sobre `remates`. Cada subconsulta ya agrega 1:1 por remate antes del join
final, así que no hay fan-out posible en el `SELECT` externo.

### D. `participants_count`: aproximación explícita, no una cuenta real de conexiones

El enunciado pide "cantidad de usuarios conectados durante el evento" en el detalle de
un remate. Presencia (`app/presence/`, Módulo 6.2) es deliberadamente en memoria, sin
persistencia (ADR-009: Redis Pub/Sub, no Streams, sin event store durable) -- no existe
ningún registro histórico de quién estuvo conectado a un remate que ya terminó, y
agregar esa persistencia (una tabla nueva de eventos de conexión, con su propio
volumen y costo de escritura en el camino más caliente del sistema) sería un cambio de
arquitectura significativo para un dato secundario de un panel de historial.

Se optó por aproximar con `HistoryRepository.get_distinct_participant_count`: la unión
(sin duplicados) de compradores que ofertaron y autores de mensajes de chat -- datos
reales, ya persistidos, que sí reflejan participación efectiva (aunque subestiman a
quienes solo miraron sin ofertar ni escribir). El campo se documenta explícitamente
como aproximación en el schema (`RemateHistoryDetail.participants_count`) y en la UI,
mismo criterio de honestidad que ADR-038 sección F ya aplicó a la línea de tiempo de
Analítica (limitaciones documentadas, no huecos silenciosos).

### E. Preparación para reportes: contrato de datos, no código especulativo

Se decidió no agregar ningún endpoint ni botón de "Exportar a PDF/Excel"/"Compartir"
que todavía no haga nada -- una UI que promete algo inexistente es peor que no tener el
botón, y el enunciado pide explícitamente no construir la generación de archivos en
este módulo. La preparación real es que `RemateHistoryDetail`/`LoteHistoryDetail` ya
son el contrato de datos completo y autocontenido (un único `GET` por recurso, sin
N+1) que un generador de reportes futuro consumiría sin cambios al modelo ni al
servicio -- documentado en docs/37, sección dedicada.

### F. Único endpoint de listado, sin distinguir scope admin/rematador en la URL

A diferencia de Auditoría (`GET /audit` global vs. `GET /remates/{id}/audit` scoped --
dos recursos genuinamente distintos), el listado de historial es un único recurso
(`GET /history/remates`) cuyo alcance depende solo del rol del token
(`HistoryService.list_finished`: `admin` sin filtro de dueño, rematador forzado a
`owner_id=viewer.id`). Esto simplifica también el frontend: `FinishedRemateList` no
necesita una prop de `scope` como sí la necesita `AuditLogView` -- el mismo componente,
sin parametrizar, sirve tanto para `/historial` (rematador) como para la pestaña
"Historial" de `/admin`.

## Alternativas consideradas

- **`HistoryService` componiendo `AnalyticsService`/`AuditService` completos**:
  descartada, ver secciones A y B.
- **Join triple `remates/lotes/ofertas` en una sola consulta**: descartada, ver sección
  C -- fan-out rompe las sumas/conteos.
- **Persistir un historial real de conexiones en Presencia** para responder
  "conectados durante el evento" con exactitud: descartada, ver sección D -- cambio de
  arquitectura significativo para un dato secundario; se prefiere la aproximación
  documentada.
- **Implementar ya la exportación a PDF/Excel**: descartada, pedido explícito del
  enunciado de dejarla preparada, no construida (sección E).
- **Un endpoint de listado por rol** (`/history/remates` vs. `/history/admin/remates`):
  descartada, ver sección F -- el rol ya viaja en el token, un segundo endpoint sería
  una distinción sin diferencia real.

## Consecuencias

- **Ventajas**: cero lógica de agregación duplicada (las métricas del detalle son,
  literalmente, las mismas consultas de Analítica); la línea de tiempo no agrega ni un
  archivo de backend nuevo; el módulo se integró sin tocar `app/realtime/`, el Gateway
  WebSocket, `app/presence/`, `app/snapshot/` ni ninguna regla de negocio existente de
  remates/lotes/ofertas/chat -- el único archivo de otro módulo tocado es
  `app/analytics/schemas.py` (dos classmethods nuevos, comportamiento verificado
  idéntico); sumar una exportación real a futuro no requiere reabrir `HistoryService`
  ni el modelo de datos.
- **Desventajas aceptadas**: `participants_count` es una aproximación, no un conteo
  exacto de conexiones (sección D); sin exportación real todavía (sección E, esperado
  por el enunciado); la duración total puede ser `null` para un remate cancelado sin
  actividad de lotes.
