# ADR-044: Gestión Post-Remate — PostAuction Service desacoplado vía eventos, máquina de estados forward-only, Notification Service mínimo nuevo

- **Fecha**: 2026-07-23
- **Estado**: Aceptada

## Contexto

El enunciado pide un módulo completo para administrar lo que pasa después de que un lote
se adjudica: estado del pago, la entrega y el cierre de la operación entre comprador y
rematador, con la instrucción explícita de "crear un PostAuction Service desacoplado" y
"evitar mezclar esta lógica con el Auction Engine". También pide reutilizar toda la
infraestructura ya construida, incluyendo un "Notification Service" -- que, al investigar
el código antes de diseñar esta fase, se confirmó que **no existe todavía** (solo un
comentario en `app/api/router.py` lo mencionaba como fase futura, sin ningún módulo ni
tabla real).

## Decisión

### A. Ubicación top-level (`app/postauction/`), no `app/modules/postauction/`

Mismo criterio que `app/audit/`/`app/history/`/`app/monitoring/`: un paquete transversal
con tabla propia que reacciona al dominio de subastas sin ser parte de él. Esto logra el
desacoplamiento pedido en dos niveles: físico (directorio hermano de `remates`/`ofertas`,
no anidado bajo ellos) y de dependencia (`app/modules/remates/lotes/service.py` no gana
ni un import nuevo). Se verifica con dos tests nuevos en
`test_architecture_boundaries.py`: uno que prohíbe a `app/postauction/` importar
transporte/tiempo real o bounded contexts ajenos, y otro (`test_domain_and_postauction_
never_import_postauction_from_domain`) que prohíbe a `app/modules/remates/` importar
`app.postauction` en absoluto -- la garantía central de este ADR, verificada
estáticamente, no solo documentada en prosa.

### B. Reacción vía evento (`lote.winner_determined`), no llamada directa

`LoteService.auto_close` ya publica `LoteWinnerDetermined` cuando un lote se vende por
vencimiento del timer con oferta ganadora (Épica 8, ADR-043). En vez de que
`LoteService` llame a un `PostAuctionService` nuevo directamente (acoplamiento en el
sentido equivocado, exactamente lo que el enunciado pide evitar), este módulo agrega su
propio `EventConsumer` + `PostAuctionEventDispatcher` -- un **tercer** suscriptor
independiente sobre el mismo canal Redis `events.*`, mismo patrón ya establecido por
`ChatSystemEventDispatcher` (Épica 6, Módulo 6.4) y `TimerExpiryScheduler` (Épica 8). El
dispatcher lee el JSON crudo del evento sin importar la clase `LoteWinnerDetermined` --
igual que `ChatSystemEventDispatcher` no importa `LoteClosed` -- así que el dominio de
remates literalmente no tiene forma de saber que este consumidor existe.

Consecuencia aceptada en su momento: el cierre **manual** de un lote vendido
(`LoteService.close`, ADR-018) no publica `LoteWinnerDetermined`. La suposición
original era que un cierre manual nunca tiene comprador real asociado (ADR-018 se
diseñó antes de que existiera el Auction Engine) -- eso dejó de ser cierto una vez que
un rematador podía cerrar manualmente un lote que sí tenía una oferta `ACCEPTED` real
(terminar la puja antes de que venza el timer), y esos casos post-remate no se creaban:
un bug real, no el alcance documentado. **Corregido** sin tocar esta decisión de
arquitectura (sigue siendo reacción vía evento, sin llamada directa): el dispatcher
también reacciona a `lote.closed` manual+vendido y resuelve la oferta líder por su
cuenta (`OfertaRepository`, dirección `postauction -> ofertas`, nunca al revés) en vez
de depender de que el evento la traiga -- ver docs/41, sección "Cómo se entera de la
adjudicación". Sin oferta real asociada (venta declarada por fuera del sistema, el
escenario que ADR-018 sí contempló) sigue sin generar un caso -- eso continúa siendo
alcance explícito, no un bug.

### C. Timeline propio insert-only, no reutilizar Historial ni Auditoría

Se investigó si `app/history/` podía servir de base para el timeline pedido por el
enunciado ("fecha, usuario, acción, estado anterior, estado nuevo") y se descartó: el
History Service (Épica 7, Módulo 7.3) **no es una tabla de eventos** -- es un compositor
de solo lectura sobre columnas ya persistidas por otros módulos, sin ningún método de
escritura. `AuditLogEntry` (Auditoría, Épica 7.2) sí es insert-only con la forma
correcta, pero es un registro *transversal* de toda la plataforma (login, CRUD, cambios
de estado de remate/lote) -- mezclar el timeline específico de un caso post-remate ahí
complicaría las consultas del panel de auditoría con una entidad completamente distinta.
Se creó `PostAuctionTimelineEntry`, estructuralmente igual a `AuditLogEntry` (actor
denormalizado, `action` como string abierto) pero propia del módulo, con `case_id` en
`ondelete="CASCADE"` (a diferencia de `AuditLogEntry`, que usa `SET NULL` en sus FKs
porque es autosuficiente incluso si la fila referenciada desaparece -- un timeline entry
no tiene ningún valor fuera de su caso).

### D. Máquina de estados forward-only con saltos permitidos

El flujo de ocho estados es lineal por naturaleza, pero la realidad operativa no
siempre respeta el orden estricto (el comprador puede pagar antes de que el rematador
registre el contacto en el sistema). Se descartó una tabla de transiciones "estado
siguiente único" (como `LoteStatus`/`RemateStatus`, que sí modelan bifurcaciones reales
-- vendido vs. no vendido) a favor de `ALLOWED_TRANSITIONS` derivado de una lista
ordenada (`STATUS_ORDER`): desde cualquier estado se permite avanzar a cualquier estado
posterior, nunca retroceder. Esto cubre "cambiar estado" y "registrar fecha de
contacto/pago/envío/entrega" con un único endpoint (`PATCH .../estado`): la fecha hito
(`STATUS_MILESTONE_FIELD`) se estampa según a qué estado se llega, no como una acción de
transporte separada.

### E. Notification Service mínimo nuevo, no solo tiempo real

Confirmado que no existe infraestructura de notificaciones reutilizable, se presentaron
dos caminos: (1) publicar únicamente los eventos de dominio de este módulo al pipeline
de WebSocket ya existente (mínimo esfuerzo, pero un usuario no conectado en ese momento
nunca se entera), o (2) construir una versión mínima persistente. Se eligió la (2)
-- consultado explícitamente, el usuario prefirió la opción persistente sobre la
solo-tiempo-real -- por ser la única que cumple de forma confiable "enviar
notificaciones" tal como lo pide el enunciado, y porque sienta las bases reales de un
futuro Notification Service completo sin haber construido nada de más: `app/
notifications/` es deliberadamente genérico (no conoce `app.postauction` ni ningún otro
módulo de dominio, verificado por su propio test de arquitectura), sin `service.py`
(la única regla, "es tuya, marcala leída", ya vive en el repositorio), sin campanita en
el header todavía (el backend ya expone todo lo necesario; agregarla es un cambio
puramente de frontend, sin abrir esta API de nuevo).

`NotificationRepository.create` se llama en la **misma transacción** que la mutación que
la origina (mismo criterio que `AuditLogRepository.record`) -- una notificación de "se
adjudicó tu lote" no puede perderse por una falla de Redis, a diferencia del Event Bus
(best-effort por diseño, ADR-022).

### F. Sin interfaces de integración externa todavía

No se agregan abstracciones para pasarelas de pago, logística, facturación o firma
digital sin un proveedor real que las use hoy -- mismo criterio "preparado, no
construido" que Prometheus/Grafana (ADR-041) o la exportación de reportes (ADR-040). La
preparación real es que "registrar pago"/"registrar envío" ya son *métodos de servicio*
independientes (`change_status` con un `new_status` puntual), y que el timeline tiene una
columna `details: JSONB` libre -- enchufar un proveedor el día de mañana es agregar una
llamada dentro de un método existente, no rediseñar el flujo.

## Alternativas consideradas

- **Ubicar el módulo bajo `app/modules/postauction/`**: descartada, ver sección A --
  rompería la simetría física con `audit`/`history`/`monitoring`, que son exactamente el
  mismo tipo de paquete (reactor/compositor sobre el dominio, no parte de él).
- **Que `LoteService.auto_close` llame directo a `PostAuctionService`**: descartada, ver
  sección B -- es literalmente el acoplamiento que el enunciado pide evitar.
- **Reutilizar `app/history/` o `app/audit/` para el timeline**: descartada, ver sección
  C -- ninguno tiene la forma correcta (Historial no escribe nada; Auditoría es
  transversal a toda la plataforma, no específico de un caso).
- **Tabla de transiciones "siguiente único" para el flujo de 8 estados**: descartada,
  ver sección D -- no refleja que el rematador puede saltar pasos en la práctica.
- **Solo tiempo real, sin persistencia, para notificaciones**: descartada, ver sección E
  -- no cumple de forma confiable el requisito de "enviar notificaciones" si el
  destinatario no está conectado en ese momento.
- **Construir adaptadores de pago/logística ahora**: descartada, ver sección F -- sin un
  proveedor real, sería código sin caso de uso, además de exactamente lo que el
  enunciado pide dejar preparado, no construido.

## Consecuencias

- **Ventajas**: cero cambios en `app/modules/remates/`, `app/modules/ofertas/`,
  `app/websocket/`, `app/snapshot/`; el desacoplamiento del Auction Engine es una
  garantía **verificada por test estático**, no solo una intención de diseño; el
  Notification Service nuevo, aunque mínimo, es genuinamente reutilizable por cualquier
  módulo futuro sin volver a tocar `app/postauction/`.
- **Desventajas aceptadas**: un cierre manual `sold` sin ninguna oferta real asociada
  (el escenario original de ADR-018) no genera un caso automático; sin integraciones
  reales de pago/logística/facturación/firma digital (esperado, preparado no
  construido). (Corregido desde entonces: un cierre manual con una oferta `ACCEPTED`
  real sí genera el caso -- ver sección B, actualizada; y la campanita de
  notificaciones ya se implementó en el rediseño de UI/UX, Épica 9 Etapa 3.)
- Integrar un proveedor de pagos/logística a futuro es: agregar la llamada al proveedor
  dentro de `PostAuctionService.change_status` (o antes de invocarlo desde un webhook
  nuevo) -- sin reabrir la máquina de estados ni el modelo de datos.
