# ADR-043: Cuenta Regresiva y Cierre Automático de Lotes — extensión anti-sniping síncrona, scheduler de expiración, columnas en `Lote` en vez de tabla nueva

- **Fecha**: 2026-07-23
- **Estado**: Aceptada

## Contexto

[ADR-007](ADR-007-anti-sniping.md) (Fase 0) ya había decidido el comportamiento
completo de anti-sniping y dejó explícito el requisito arquitectónico central: "esta
funcionalidad depende de que el estado del timer del lote viva en Postgres, no en
memoria de una instancia... para que cualquier instancia pueda evaluar correctamente si
corresponde extender". `RemateSettings.anti_sniping_enabled`/
`anti_sniping_extension_seconds` existían en el schema desde entonces, sin ningún
código que los leyera. Este módulo implementa esa decisión por primera vez, más el
resto del pedido (temporizador configurable, cierre automático, adjudicación,
controles del rematador) que ADR-007 no cubría.

Restricción explícita del enunciado de este módulo: no modificar la arquitectura
existente, reutilizar toda la infraestructura ya construida (Postgres, Redis, Event
Bus, WebSockets, Auction Engine, Presence/Analytics/Audit Service).

## Decisión

### A. Columnas nuevas en `Lote`, no una tabla `lote_timers` separada

El timer es un atributo del ciclo de vida de un lote, no una entidad con identidad
propia (nunca se referencia por su propio id, nunca tiene historial propio más allá de
lo que la auditoría ya registra). Tres columnas (`timer_ends_at`,
`timer_paused_remaining_seconds`, `timer_auto_close_enabled`) alcanzan para derivar los
tres estados posibles (corriendo / pausado / sin timer) sin un enum de estado propio ni
un `PAUSED` nuevo en `LoteStatus` -- la pausa es del *timer*, no del lote, que sigue
`OPEN` todo el tiempo. Esto también evita una migración más invasiva (tabla + FK +
índices propios) para un dato que vive y muere exactamente con el ciclo de vida del
lote que lo contiene.

### B. La extensión anti-sniping es una llamada síncrona, no un consumidor de eventos

Se evaluó reaccionar a `OfertaAccepted` con un tercer `EventConsumer` (mismo patrón que
`ChatSystemEventDispatcher`, Módulo 6.4) para extender el timer. Se descartó: existe
una ventana real entre que la oferta se acepta y confirma (commit) y el momento en que
ese consumidor, asíncrono, procesa el evento -- en esa ventana,
`TimerExpiryScheduler` podría cerrar el lote antes de que la extensión se aplique,
perdiéndola exactamente en el caso que más importa (una oferta de último segundo, la
razón de ser de todo este mecanismo). Mismo razonamiento que ya usó
[ADR-039](ADR-039-sistema-de-auditoria-y-trazabilidad.md) para descartar el Event Bus
para auditoría ("incompatible con nunca perder un registro").

En cambio, `AuctionEngine.place_bid` (rama `ACCEPTED`) llama síncronamente a
`TimerService.maybe_extend_for_bid(lote, remate)` -- un `@staticmethod` que muta el
mismo objeto `Lote` ya cargado y bloqueado por `get_by_id_for_update` (ADR-004), antes
del único `commit()` que la función ya hacía. El propio commit persiste la extensión
junto con la oferta, en la misma transacción: no hay ventana de carrera posible. El
evento (`LoteTimerExtended`) se publica después de ese commit, como cualquier otro
evento del proyecto.

Se aplicó el mismo criterio, por consistencia y simplicidad (no por necesidad de
correctitud tan estricta), al arranque del timer: `LoteService.open`/`open_next` llaman
a `TimerService.start_for_lote` antes de su propio commit, en vez de un consumidor de
eventos reaccionando a `LoteOpened`. Menos piezas móviles, mismo resultado.

### C. El cierre automático SÍ necesita una tarea de fondo nueva

A diferencia de arranque/extensión (reaccionan a una llamada ya existente), "el tiempo
se agotó" no es consecuencia de ninguna acción -- nada lo dispara por sí solo. Se
agregó `TimerExpiryScheduler` (`app/timer/scheduler.py`), con el mismo patrón ya
establecido por `EventConsumer`/`ChatSystemEventDispatcher`: arranca/se detiene en el
`lifespan` de `app/main.py`, una sesión de base propia por tick.

Cada tick (1s): busca candidatos por índice (`LoteRepository.list_expired_open_lote_ids`),
y para cada uno adquiere el lock de fila (`get_by_id_for_update`, el mismo mecanismo de
ADR-004, usado acá por primera vez por algo distinto del Auction Engine) para
serializarse contra un bid o una acción del rematador en curso, revalida todo después
de tomar el lock (pudo haberse extendido/pausado/cerrado, o el remate pausarse,
mientras esperaba), y solo entonces adjudica. Esto convierte el mismo lock que ya
garantizaba RNF-09 para ofertas concurrentes en la garantía de que un bid y el
scheduler nunca dejan un estado inconsistente entre sí.

### D. El cierre automático respeta la pausa del remate

Si el rematador pausó el remate (no el timer específicamente), nadie puede ofertar
mientras tanto -- adjudicar automáticamente en ese momento sería injusto para
cualquiera que hubiera querido reaccionar. El scheduler chequea `remate.status ==
LIVE` antes de cerrar; si está pausado, no hace nada (el timer sigue vencido en
términos absolutos, se cierra en el primer tick después de reanudar).

### E. `LoteService.close()` se refactoriza, no se duplica

El cierre automático necesita la misma mutación/auditoría que ya hace `close()`
(transición de estado, `final_price`, evento `LoteClosed`), pero sin un `owner` humano
(actor del sistema) y calculando `outcome`/`final_price` de la oferta líder en vez de
recibirlos como parámetros. Se extrajo `_apply_close` (privado, mutación + auditoría
compartida, sin commit ni publish) que ambos `close()` (sin cambiar su firma ni
comportamiento externo) y el nuevo `auto_close()` (llamado solo por el scheduler)
reusan. `LoteClosed` gana `triggered_by: Literal["manual", "auto"]`, mismo patrón que
`RemateFinished.triggered_by` (Épica 2.3, RF-10) ya estableció para distinguir una
transición manual de una automática.

### F. Auditoría de una acción del sistema: `actor_id=None`

Para `auto_close()`, se reusó el patrón ya existente en
`RemateService.try_auto_finish`/`_record_status_change`: `actor_id=None`,
`actor_name=None`, `actor_role=None`, con `"trigger": "auto"` en los detalles -- sin
inventar un actor sintético ("Sistema") ni una columna nueva. El esquema de
`AuditLogEntry.actor_id` ya es nullable (`ON DELETE SET NULL` hacia `users`), así que
no hizo falta ningún cambio de esquema para esto.

### G. `app/timer/` es un paquete top-level, no vive dentro de `app/modules/remates/lotes/`

Se evaluó ubicar el Timer Service como un archivo más dentro de
`app/modules/remates/lotes/` (mismo bounded context, mismo perfil de acoplamiento). Se
prefirió un paquete top-level nuevo, mismo nivel que `app/snapshot/`, por dos motivos:
(1) el enunciado pide explícitamente un "Timer Service desacoplado", nombrado igual que
los otros servicios transversales del proyecto (Presence, Analytics, Audit); (2) aunque
`app/timer/` sí depende de modelos de `remates`/`remates.lotes` (igual que
`app/snapshot/` depende de `app.modules.ofertas`), la dirección de esa dependencia es
de una sola vía -- ningún módulo de dominio depende de vuelta de `app/timer/` salvo
`LoteService`/`AuctionEngine` llamando a sus `@staticmethod` puros, que no requieren
inyectar una instancia. Se verificó (test de arquitectura nuevo,
`test_architecture_boundaries.py`) que no se generó ningún import circular.

## Alternativas consideradas

- **Tabla `lote_timers` separada**: descartada, ver sección A.
- **Extensión anti-sniping vía un tercer `EventConsumer`**: descartada, ver sección B
  -- ventana de carrera real contra el scheduler de expiración.
- **Cierre automático como parte de un `EventConsumer` reaccionando a algo**:
  descartada, ver sección C -- no existe ningún evento que "el tiempo se agotó"
  dispare por sí solo; hace falta una tarea que sondee activamente.
- **Duplicar la lógica de cierre en vez de refactorizar `close()`**: descartada, ver
  sección E -- el enunciado pide explícitamente evitar duplicar lógica.
- **Actor sintético "Sistema" para la auditoría automática**: descartada, ver sección
  F -- el patrón `actor_id=None` ya resuelve esto sin inventar nada nuevo.

## Consecuencias

- **Ventajas**: cero cambios en la lógica de aceptación/rechazo de ofertas del Auction
  Engine, en `LoteService.close()` (comportamiento externo intacto), en
  `app/websocket/`, `app/realtime/consumer.py`/`dispatcher.py`; el lock de fila de
  ADR-004 se valida como un mecanismo de concurrencia genérico, no acoplado a
  ofertas; la extensión anti-sniping nunca puede perderse por una condición de
  carrera con el cierre automático.
- **Desventajas aceptadas**: el scheduler sondea cada 1s (resolución de un segundo,
  no milisegundos -- aceptable para una cuenta regresiva humana); sin límite a
  extensiones anti-sniping repetidas (mismo riesgo ya aceptado por ADR-007, mitigado
  por el cierre manual siempre disponible); un timer por remate, no por lote
  (pedido explícito del enunciado).
- Escalar la resolución del scheduler (por ejemplo, a cientos de milisegundos) sería
  ajustar `DEFAULT_TICK_INTERVAL_SECONDS`, sin cambiar ninguna otra pieza del diseño.
