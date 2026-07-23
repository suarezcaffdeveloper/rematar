# 41 — Gestión Post-Remate (Épica 7, Módulo 7.5)

Este documento es la referencia de diseño del PostAuction Service: cómo se entera de que
un lote fue adjudicado, los ocho estados del flujo y quién los dispara, el timeline de
cambios, las notificaciones nuevas y cómo encaja todo sin tocar el Auction Engine. Ver
[ADR-044](adr/ADR-044-gestion-post-remate.md) para el razonamiento completo de las
decisiones tomadas acá.

## Alcance de este módulo

- **PostAuction Service** (`app/postauction/`), desacoplado del Auction Engine: crea
  automáticamente un caso de seguimiento cuando un lote se adjudica por puja
  (`lote.winner_determined`), sin que `app/modules/remates/lotes/service.py` sepa que
  este módulo existe.
- **Flujo de ocho estados**: Adjudicado → Pendiente de contacto → Pago pendiente → Pago
  recibido → Preparando entrega → Enviado → Entregado → Finalizado. Solo hacia adelante,
  con saltos permitidos, validado por una máquina de estados propia.
- **"Mis compras"** (comprador): lotes ganados, estado actual, fecha de adjudicación,
  precio final, información del rematador, historial del proceso, observaciones.
- **"Ventas adjudicadas"** (rematador): cambiar estado, agregar observaciones, registrar
  fecha de contacto/pago/envío/entrega (todo a través de un único endpoint de cambio de
  estado, que estampa la fecha hito correspondiente), buscar y filtrar por estado.
- **Línea de tiempo** por caso: fecha, usuario, acción, estado anterior, estado nuevo --
  tabla insert-only propia (`PostAuctionTimelineEntry`), no una reutilización de
  Auditoría ni de Historial (ver ADR-044, sección C).
- **Notification Service mínimo** (`app/notifications/`), nuevo: no existía ningún
  módulo de notificaciones antes de esta fase (verificado explícitamente). Se
  construyó una versión mínima y persistente, disparada en los cuatro momentos que pide
  el enunciado (adjudicación, cambio de estado, pago registrado, entrega confirmada).

**No se implementa**: integración real con pasarelas de pago, empresas de logística,
facturación ni firma digital -- se documentan como puntos de extensión natural (ver
sección dedicada), no se agrega código sin uso real hoy.

## Dónde vive el código

`app/postauction/` -- paquete transversal nuevo, top-level, mismo nivel que
`app/audit/`/`app/history/`/`app/monitoring/`: reacciona al dominio de subastas sin ser
parte de él.

| Archivo | Responsabilidad |
|---|---|
| `models.py` | `PostAuctionStatus` (enum nativo, 8 valores), `PostAuctionCase` (registro vivo, FKs `RESTRICT`), `PostAuctionTimelineEntry` (insert-only, `case_id` en `CASCADE`). |
| `state_machine.py` | `STATUS_ORDER`, `ALLOWED_TRANSITIONS` (derivado de `STATUS_ORDER`: cualquier estado posterior, nunca hacia atrás), `STATUS_MILESTONE_FIELD`, `assert_transition_allowed`. |
| `repository.py` | `PostAuctionRepository` -- CRUD del caso, timeline, listados con join a `Lote`/`User` para búsqueda de texto. |
| `service.py` | `PostAuctionService` -- `create_case_from_winner` (disparado por el dispatcher), `change_status`, `add_note`, listados y detalle con ownership. |
| `schemas.py` | DTOs Pydantic -- `PostAuctionCaseRead`/`Detail` se arman a mano (mismo criterio que `HistoryService`: `lote_id`/`buyer_id`/`rematador_id` son FKs simples sin `relationship()`). |
| `events.py` | `PostAuctionCaseCreated`, `PostAuctionStatusChanged` (`RemateScopedEvent`, mismo canal que Remate/Lote/Oferta/Chat). |
| `realtime.py` | `PostAuctionEventDispatcher` -- segunda instancia de `EventConsumer` (mismo patrón que `ChatSystemEventDispatcher`), reacciona a `lote.winner_determined` sin importar su clase de evento. |
| `dependencies.py`, `router.py` | Endpoints `/postauction/ventas` (rematador) y `/postauction/mis-compras` (comprador). |

`app/notifications/` -- paquete nuevo, mínimo, genérico (no conoce a `postauction` ni a
ningún otro módulo de dominio):

| Archivo | Responsabilidad |
|---|---|
| `models.py` | `Notification` -- destinatario, tipo, título, mensaje, referencia opcional a un recurso, `read_at` (`None` = no leída). |
| `repository.py` | `create` (síncrono, no comitea -- misma transacción que quien la dispara), `list_for_user`, `mark_read`, `mark_all_read`, `count_unread`. Sin `service.py`: la única regla ("es tuya, marcala leída") ya vive en el repositorio. |
| `router.py` | `GET /notifications`, `GET /notifications/no-leidas/conteo`, `PATCH /notifications/{id}/leer`, `POST /notifications/leer-todas`. |

**Archivos existentes tocados**, todos additivos:

- `app/main.py` (`_lifespan`): un **tercer** `EventConsumer` + `PostAuctionEventDispatcher`,
  arrancado/detenido junto a los otros dos.
- `app/realtime/registry.py`: `PostAuctionCaseCreated`/`PostAuctionStatusChanged`
  agregados a `SYNCED_EVENTS` (para sincronía en vivo si el usuario ya está en la sala
  de ese remate).
- `app/audit/actions.py`: tres constantes nuevas (`POSTAUCTION_CASE_CREATED`/
  `STATUS_CHANGED`/`NOTE_ADDED`) -- este módulo audita como cualquier módulo de dominio.
- `app/db/base.py`, `app/api/router.py`: import/registro de los modelos y routers
  nuevos, mismo patrón que cada fase anterior.
- `tests/test_architecture_boundaries.py`: tres tests nuevos (ver más abajo).

**Cero cambios en** `app/modules/remates/`, `app/modules/ofertas/`, `app/websocket/`,
`app/snapshot/`, `app/audit/service.py` -- el Auction Engine no se entera de que este
módulo existe.

## Cómo se entera de la adjudicación

`LoteService.auto_close` (Épica 8, ADR-043) ya publica `LoteWinnerDetermined` cuando un
lote se vende por vencimiento del timer con una oferta ganadora -- este módulo agrega un
**tercer** `EventConsumer`, con su propio `PostAuctionEventDispatcher`, suscripto al
mismo canal `events.*` que ya consumen el pipeline de WebSocket y
`ChatSystemEventDispatcher`. El dispatcher:

1. Filtra por `event_type == "lote.winner_determined"` (whitelist explícita, mismo
   criterio que `SYSTEM_MESSAGE_BUILDERS`/`EVENT_REGISTRY`).
2. Lee `remate_id`/`lote_id`/`buyer_id`/`amount` del JSON crudo -- **no importa** la
   clase `LoteWinnerDetermined`, igual que `ChatSystemEventDispatcher` no importa
   `LoteClosed`: el dominio de remates no sabe que este consumidor existe.
3. Llama `PostAuctionService.create_case_from_winner(...)`, que resuelve `Remate`/
   `Lote`/`User` (buyer), crea el caso en `ADJUDICADO`, deja constancia en auditoría y
   timeline, dispara las dos notificaciones de adjudicación, y publica
   `PostAuctionCaseCreated`.

**Limitación conocida y documentada**: el cierre **manual** de un lote vendido
(`LoteService.close`, ADR-018) no publica `LoteWinnerDetermined` porque no hay
comprador asociado en ese flujo (el rematador declara un precio sin motor de ofertas) --
esos casos no generan un caso post-remate automático. No es un bug: sin un comprador real
no hay a quién notificar ni con quién hacer seguimiento.

## El flujo de ocho estados

```
Adjudicado → Pendiente de contacto → Pago pendiente → Pago recibido
           → Preparando entrega → Enviado → Entregado → Finalizado
```

- **Adjudicado**: estado inicial, creado automáticamente al detectar el ganador.
- **Pendiente de contacto → Pago pendiente**: al llegar a "Pago pendiente" se estampa
  `contacted_at` (confirma que el contacto ya se hizo).
- **Pago pendiente → Pago recibido**: estampa `payment_at`, dispara la notificación "Pago
  registrado" al comprador.
- **Pago recibido → Preparando entrega → Enviado**: estampa `shipped_at`.
- **Enviado → Entregado**: estampa `delivered_at`, dispara "Entrega confirmada".
- **Entregado → Finalizado**: estampa `finalized_at`, cierra el caso.

Todas las transiciones las dispara el rematador dueño de la venta (o un administrador)
vía `PATCH /postauction/ventas/{id}/estado` -- un único endpoint cubre "cambiar estado" y
"registrar fecha de contacto/pago/envío/entrega" del enunciado: la fecha hito es
consecuencia de a qué estado se llega, no una acción separada. `occurred_at` es opcional
en el body para backdatear (ej. "el pago llegó ayer"); por defecto es el momento del
pedido.

## Cambios de estado -- máquina de estados

`ALLOWED_TRANSITIONS` se construye a partir de `STATUS_ORDER` (`state_machine.py`): desde
cualquier estado se permite avanzar a **cualquier estado posterior**, nunca retroceder.
Esto permite que el rematador salte pasos (ej. el comprador ya pagó antes de que se
registrara el contacto) sin permitir "des-adjudicar" un caso. Una transición inválida
levanta `BusinessRuleError` (422), mismo patrón que `app/modules/remates/lotes/
state_machine.py`.

## Notificaciones

| Momento | Destinatario(s) | Disparado por |
|---|---|---|
| Lote adjudicado | Comprador y rematador | `PostAuctionService.create_case_from_winner` |
| Cambio de estado | Comprador | `PostAuctionService.change_status` (mensaje genérico) |
| Pago registrado | Comprador | `change_status` con `new_status = pago_recibido` (mensaje específico) |
| Entrega confirmada | Comprador | `change_status` con `new_status = entregado` (mensaje específico) |

Cada notificación se escribe en la **misma transacción** que la mutación que la origina
(`NotificationRepository.create`, sin `commit()` propio) -- mismo criterio que
`AuditLogRepository.record`: nunca se pierde, no depende del Event Bus best-effort.
Además, `PostAuctionCaseCreated`/`PostAuctionStatusChanged` se sincronizan en vivo por el
pipeline de WebSocket existente si el destinatario ya está conectado a la sala de ese
remate -- las notificaciones persistidas son la garantía de entrega real, el WebSocket es
un bonus de "verlo aparecer al instante" si ya está mirando esa pantalla.

## Preparación para integraciones futuras -- preparado, no construido

Mismo criterio "preparado, no construido" que Prometheus/Grafana (ADR-041) o la
exportación de reportes (ADR-040): no se agregan interfaces ni dependencias sin un caso
de uso real hoy. Lo que ya está en su lugar:

- **Pasarelas de pago**: "registrar pago" ya es una llamada a `change_status(new_status=
  pago_recibido, ...)`, un método de servicio independiente -- integrar un proveedor
  real es agregar la llamada al proveedor dentro de ese método (o antes de invocarlo
  desde un webhook nuevo), sin rediseñar el flujo de estados.
- **Logística**: mismo razonamiento para "registrar envío"/"confirmar entrega"
  (`new_status = enviado` / `entregado`).
- **Facturación y firma digital**: la columna `details: JSONB` del timeline (hoy sin
  uso) es el lugar natural para adjuntar referencias externas (número de factura, id de
  documento firmado) el día que exista esa integración.

## Control de acceso

- `GET /postauction/ventas`, `GET /postauction/ventas/{id}`, `PATCH .../estado`,
  `POST .../notas`: rematador dueño de la venta (`case.rematador_id == viewer.id`,
  denormalizado al crear el caso -- no hace falta resolver el remate para autorizar) o
  administrador.
- `GET /postauction/mis-compras`, `GET /postauction/mis-compras/{id}`: comprador dueño
  (`case.buyer_id == viewer.id`) o administrador; un `case_id` ajeno devuelve 404 (no
  confirma su existencia a quien no debería saberlo, mismo criterio que un `remate`
  `DRAFT` ajeno).
- `GET /notifications*`: cualquier usuario autenticado, siempre scoped a sí mismo.

## Interfaz -- frontend

`features/postauction/`, mismo layout que `features/monitoring/`/`features/history/`:

| Archivo | Qué hace |
|---|---|
| `types.ts` | Espeja `schemas.py`. |
| `labels.ts` | `STATUS_ORDER`/`STATUS_LABELS`/`STATUS_BADGE_VARIANTS`, `nextStatusOptions` (espeja `state_machine.py` para ofrecer solo transiciones válidas -- el backend igual revalida). |
| `api.ts` | Una función por endpoint. |
| `hooks.ts` | `useVentasAdjudicadas`/`useVentaDetail`/`useMisCompras`/`useMiCompraDetail` -- fetch simple, `reload()` manual tras una mutación (sin WebSocket propio en esta pantalla). |
| `components/StatusBadge.tsx` | Badge de color por estado. |
| `components/ProgressStepper.tsx` | Indicador visual de progreso sobre los 8 estados (pedido explícito del enunciado). |
| `components/Timeline.tsx` | Línea de tiempo (fecha, usuario, acción, estado anterior/nuevo, observación). |
| `components/CaseCard.tsx` | Tarjeta de listado, reutilizada por ambos lados (`perspective="rematador"` muestra al comprador, `perspective="comprador"` muestra al rematador). |
| `components/StatusChangeForm.tsx`, `components/NoteForm.tsx` | Acciones del rematador. |
| `components/SearchFilterBar.tsx` | Buscar y filtrar por estado. |
| `pages/VentasAdjudicadasPage.tsx`, `pages/VentaAdjudicadaDetailPage.tsx` | `/ventas-adjudicadas`, `/ventas-adjudicadas/:caseId`. |
| `pages/MisComprasPage.tsx`, `pages/MiCompraDetailPage.tsx` | `/mis-compras`, `/mis-compras/:caseId`. |

Entradas de navegación nuevas: botón "Ventas adjudicadas" en `RematadorDashboardPage`
(junto al ya existente "Ver historial") y botón "Mis compras" en
`CompradorDashboardPage`.

## Limitaciones conocidas (documentadas, no huecos)

- **El cierre manual de un lote vendido (ADR-018) no genera un caso automático** -- ver
  sección "Cómo se entera de la adjudicación". El rematador no tiene, en esta fase, una
  forma de crear un caso post-remate a mano para ese escenario.
- **Sin campanita global de notificaciones en el header** -- el backend ya expone todo
  lo necesario (`GET /notifications`, conteo de no leídas), agregarla es un cambio
  puramente de frontend, sin tocar la API.
- **Sin integraciones reales de pago/logística/facturación/firma digital** --
  preparado, no construido (ver sección dedicada).

## Checklist del módulo

- [x] PostAuction Service desacoplado (`app/postauction/`), sin cambios en el Auction
      Engine.
- [x] Flujo de 8 estados, máquina de estados validada, solo hacia adelante.
- [x] "Mis compras" (comprador): lotes ganados, estado, fecha, precio, rematador,
      historial, observaciones.
- [x] "Ventas adjudicadas" (rematador): cambiar estado, agregar observaciones, registrar
      fechas, buscar, filtrar por estado.
- [x] Línea de tiempo por caso (fecha, usuario, acción, estado anterior/nuevo).
- [x] Notificaciones en los cuatro momentos pedidos (adjudicación, cambio de estado,
      pago, entrega) -- Notification Service nuevo y mínimo (`app/notifications/`).
- [x] Indicador visual de progreso, línea de tiempo, diseño responsive.
- [x] Preparación documentada (no construida) para pagos/logística/facturación/firma
      digital.
- [x] Tests backend: `test_postauction_service.py`, `test_postauction_repository.py`,
      `test_postauction_router.py`, `test_postauction_realtime.py`,
      `test_notifications_repository.py`, `test_notifications_router.py`; tests nuevos
      en `test_architecture_boundaries.py`.
- [x] Tests frontend: `hooks.test.ts`, `Timeline.test.tsx`, `ProgressStepper.test.tsx`,
      `CaseCard.test.tsx`, `StatusChangeForm.test.tsx`, `NoteForm.test.tsx`.
- [x] Documentación (este archivo) y ADR (ADR-044) actualizados.
