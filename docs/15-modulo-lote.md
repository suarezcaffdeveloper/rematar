# 15 — Módulo Lote (Épica 2, Módulo 2.2)

Este documento es la referencia de diseño de la entidad `Lote`. Complementa, no reemplaza,
lo ya definido en Fase 0 ([03](03-requisitos-funcionales.md), [07](07-maquinas-de-estado.md),
[11](11-glosario.md)) ni lo definido para `Remate` en el Módulo 2.1
([14-modulo-remate.md](14-modulo-remate.md)).

## Alcance de este módulo

Se modela únicamente la entidad `Lote` y su relación con `Remate` (cada lote pertenece a
exactamente un remate; un remate contiene cero o más lotes), con CRUD completo, permisos y
reordenamiento — **sin ninguna lógica de subasta**. Explícitamente fuera de alcance:

- Abrir o cerrar un lote (transiciones `PENDING -> OPEN` y `OPEN -> CLOSED_*`).
- Determinar ganadores.
- Ofertas / bidding, WebSockets, Redis, chat, streaming.

Un lote, en esta fase, se crea siempre en `PENDING` y se queda ahí — el módulo entero es
CRUD de estructura, no de ciclo de vida en tiempo real. Esto es intencional y refleja
exactamente el pedido: "diseñar únicamente el dominio de los lotes".

## Dónde vive el código

`app/modules/remates/lotes/` — un sub-paquete **dentro** del módulo `remates`, no un
módulo nuevo al mismo nivel que `auth`/`users`/`remates`. Razón: [09-arquitectura-y-decisiones.md](09-arquitectura-y-decisiones.md)
ya agrupa explícitamente "remates y lotes" bajo un único módulo interno ("Remates: ciclo
de vida de remates y lotes, sus máquinas de estado") — Lote no cruza un límite de módulo
como sí lo hace `Remate.owner_id` hacia `users` (dominios genuinamente distintos: Auth/
Usuarios vs. Remates). Mismo motivo por el que `Lote.remate_id` **sí** puede tener, el día
que haga falta, un `relationship()` de SQLAlchemy hacia `Remate` sin violar
[ADR-001](adr/ADR-001-modular-monolito-vs-microservicios.md) — aunque esta fase, igual
que hizo `Remate.owner_id`, no lo usa: todo acceso pasa por consultas explícitas del
repository/service, no por navegación de grafo ORM. Se prefiere así por consistencia con
el resto del código (el proyecto no usa `relationship()` en ningún lado todavía) y para no
introducir la primera dependencia de carga diferida (`lazy loading`) async de SQLAlchemy —
que exige disciplina de `selectinload`/`joinedload` explícita para no romper — sin que
haya un beneficio concreto que la justifique hoy.

Estructura interna, calcada del patrón de `app/modules/remates/`: `models.py`,
`schemas.py`, `repository.py`, `service.py`, `dependencies.py`, `router.py`,
`state_machine.py`. Los únicos archivos **existentes** modificados son los dos puntos de
extensión ya usados en el Módulo 2.1 — `app/db/base.py` (registrar `Lote` para Alembic) y
`app/modules/remates/router.py` (montar el router de lotes bajo `/remates/{remate_id}/lotes`,
con una sola línea de `include_router`) — nada del código ya existente de `Remate` se
reescribe.

## Campos del modelo: justificación y obligatoriedad

| Campo | Obligatorio | Por qué |
|---|---|---|
| `remate_id` | Sí (de la URL, no del body) | Todo lote pertenece a exactamente un remate; se toma del path (`/remates/{remate_id}/lotes`), nunca de un campo editable, para que sea imposible mover un lote a otro remate por error o creárselo a un remate ajeno. FK simple (`ForeignKey("remates.id", ondelete="RESTRICT")`), sin `relationship()` (ver arriba). |
| `lot_number` | Sí | Identificador de catálogo elegido por el rematador (ver [ADR-015](adr/ADR-015-numero-de-lote-y-orden-de-exhibicion-separados.md)). Único dentro del remate. |
| `title` | Sí | Igual que `Remate.title`: un lote necesita nombre para existir y mostrarse, incluso antes de tener imágenes o descripción completa. |
| `category` | Sí | Reutiliza `RemateCategory` (ver [ADR-014](adr/ADR-014-atributos-flexibles-de-lote-y-categoria-compartida.md)) — permite catalogar cada lote independientemente del remate que lo contiene. |
| `images` | No (lista, puede ser vacía) | JSONB con `{url, order, caption}` por imagen (ver ADR-014/ADR-012 y su precedente). No hay subida/almacenamiento de archivos en este proyecto (mismo alcance que `Remate.cover_image_url`): son URLs a un recurso externo. |
| `documents` | No (lista, puede ser vacía) | Igual que `images` pero para documentación adjunta (ej. certificado sanitario de hacienda, título de propiedad de un vehículo, plano de un inmueble): `{url, title, document_type}`. Explícitamente opcional, como pide el enunciado. |
| `base_price` | Sí | Precio inicial de la subasta del lote (RF-06). `Numeric(14,2)` — primer campo monetario del proyecto; se usa `Decimal` (no `float`) para no introducir error de redondeo en un dato de dinero. Debe ser `> 0` (constraint de base). |
| `min_increment` | Sí | Incremento mínimo entre ofertas (RF-06/RF-17, aunque la validación de ofertas en sí es de un módulo futuro). Debe ser `> 0`: un incremento de 0 no tiene sentido como "mínimo". |
| `reserve_price` | No | Precio mínimo aceptable por el rematador. Si está presente, debe ser `>= base_price` (constraint de base). Se **oculta** a compradores en la lectura — ver [ADR-016](adr/ADR-016-precio-de-reserva-oculto-a-compradores.md). |
| `display_order` | Sí, sistema | Posición de exhibición dentro del remate. Asignado automáticamente al crear (siguiente posición libre); solo se modifica vía el endpoint de reordenamiento, nunca por `PATCH` directo (ver ADR-015). |
| `status` | Sí, sistema (default `PENDING`) | Ver "Estados" más abajo. Este módulo no expone ninguna transición: todo lote queda en `PENDING`. |
| `created_at`, `updated_at` | Sistema | `TimestampMixin`, reusado sin cambios. |
| `deleted_at` | No (soft delete) | `SoftDeleteMixin`, reusado sin cambios — el propio mixin, escrito en el Módulo 2.1, ya anticipaba esta reutilización para Lotes. |

### Campos propuestos, más allá del mínimo pedido

El enunciado invita a proponer y justificar campos adicionales si aportan al objetivo de
"modelo flexible para distintos tipos de remate". Se proponen dos:

- **`attributes` (JSONB, `dict` libre, default `{}`)**: es el mecanismo central de
  flexibilidad del modelo — ver [ADR-014](adr/ADR-014-atributos-flexibles-de-lote-y-categoria-compartida.md)
  para la justificación completa. Sin este campo, "soportar ganado, maquinaria, vehículos
  e inmuebles" solo sería posible agregando columnas específicas de cada tipo a la tabla
  `lotes` (la mayoría nulas para cualquier lote que no sea de ese tipo) o con una tabla por
  tipo — ambas opciones exactamente lo que el pedido de este módulo busca evitar.
- **`quantity` (`int`, default `1`, `>= 1`) y `unit_label` (`str`, opcional)**: muchos
  lotes representan varias unidades idénticas vendidas juntas como un solo ítem de subasta
  — "10 cabezas de hacienda", "50 bolsas de semilla", "3 tractores del mismo modelo". Sin
  este campo, esos casos obligarían a describir la cantidad dentro del texto libre de
  `title`/`description`, sin poder mostrarla ni validarla de forma estructurada.
  `unit_label` es un texto libre corto (ej. "cabezas", "hectáreas", "unidades") en vez de
  un catálogo cerrado de unidades: no hay hoy un requisito de normalizar/filtrar por
  unidad, y forzar un enum cerrado de unidades de medida sería sobre-ingeniería para lo
  que se pide en esta fase.

### Decisiones deliberadamente no tomadas en este módulo

- **Sin moneda propia por lote**: los montos (`base_price`, `min_increment`,
  `reserve_price`) se expresan implícitamente en la moneda configurada en
  `Remate.settings.currency` (ADR-012). Un lote con una moneda distinta a la de su propio
  remate no tiene sentido operativo (el remate se desarrolla y se cierra en una única
  moneda) y agregar el campo solo introduciría un estado inconsistente posible sin ningún
  caso de uso que lo pida.
- **Sin columnas de auditoría de cancelación/cierre** (`cancellation_reason`,
  `cancelled_at`, `closed_at`): a diferencia de `Remate.finished_at` (pre-agregada en el
  Módulo 2.1 porque *ese mismo* módulo ya sabía que la completaría el trabajo de Lotes),
  estas columnas pertenecen a una transición que corresponde a un módulo distinto y
  todavía no diseñado (Ofertas/Auction Engine). Agregarlas ahora sería anticipar el diseño
  de ese módulo sin tenerlo. Se agregan en su propia migración cuando ese módulo exista.

## Estados de un Lote

Los cinco estados y transiciones ya están definidos en Fase 0
([07-maquinas-de-estado.md](07-maquinas-de-estado.md)) y no cambian acá: `PENDING`,
`OPEN`, `CLOSED_SOLD`, `CLOSED_UNSOLD`, `CANCELLED`. **Se decidió explícitamente no
agregar un estado `PAUSED` propio de Lote** (evaluado y descartado durante el diseño de
este módulo): la pausa ya es un concepto de `Remate` (`Remate.status = PAUSED`) que aplica
a todo el remate, incluido cualquier lote `OPEN` en ese momento — introducir un segundo
`PAUSED` a nivel de lote crearía dos banderas independientes que podrían desincronizarse
(remate `LIVE` con un lote marcado `PAUSED`, o remate `PAUSED` con su lote todavía
`OPEN`), exactamente el tipo de "estado imposible" que la introducción de
`07-maquinas-de-estado.md` dice que el modelado explícito de máquinas de estado busca
evitar.

`app/modules/remates/lotes/state_machine.py` modela las **cinco transiciones completas**
(`ALLOWED_TRANSITIONS`), igual que hizo `remates/state_machine.py` en el Módulo 2.1, pero
**ninguna se expone todavía por HTTP** — este módulo crea lotes directamente en `PENDING`
y no ofrece ninguna acción de transición. Cuando el módulo de Ofertas exista, reutiliza
esta misma tabla en vez de rediseñarla.

## Reglas de edición de estructura (RF-05, RF-07)

Crear, editar, eliminar y reordenar lotes de un remate solo está permitido mientras ese
remate está en `DRAFT` o `SCHEDULED` — igual que la regla ya implementada en
`RemateService.update` para el propio remate (RF-05: "un remate solo puede editarse...
mientras está en DRAFT o SCHEDULED. Una vez LIVE, su estructura de lotes queda
congelada"). `LoteService` valida esto contra el `Remate` padre antes de cualquier
escritura.

## Reglas de visibilidad y permisos

| Quién | Puede ver | Puede crear/editar/eliminar/reordenar |
|---|---|---|
| Rematador, dueño del remate | Cualquier lote de remates propios, cualquier estado del remate | Sí, únicamente en remates propios |
| Rematador, remate ajeno | Solo lotes de remates que no estén en `DRAFT` (mismo criterio que ver el remate) | No (403) |
| Comprador | Solo lotes de remates que no estén en `DRAFT` | No (403) |
| Administrador | Todos, cualquier estado | No (403) — solo visualiza, igual que con `Remate` |

La visibilidad de un lote se deriva **enteramente** de la visibilidad de su remate padre
(`RemateService._is_visible`, reutilizado sin cambios): no hay un concepto de "lote
privado dentro de un remate público". Un lote de un remate no visible devuelve 404 (nunca
403), exactamente por la misma razón ya documentada para `Remate`: no confirmar la
existencia de algo que el usuario no debería poder ver.

No hay un chequeo de rol explícito (`require_roles`) en los endpoints de escritura de
Lote: la verificación de *ownership* del remate padre (`RemateService.get_owned_or_raise`)
ya es suficiente, porque solo un usuario con rol `rematador` puede ser dueño de un remate
en primer lugar (se crea así desde el Módulo 2.1). Mismo patrón que ya usa
`remates/router.py` para sus propios endpoints de escritura que no son `POST /remates`.

## Endpoints expuestos

- `POST /remates/{remate_id}/lotes` → crea en `PENDING`, con `display_order` asignado
  automáticamente.
- `GET /remates/{remate_id}/lotes` → lista paginada, visible según la tabla de arriba.
- `GET /remates/{remate_id}/lotes/{lote_id}` → detalle.
- `PATCH /remates/{remate_id}/lotes/{lote_id}` → edición parcial (no incluye
  `display_order` ni `status`).
- `DELETE /remates/{remate_id}/lotes/{lote_id}` → soft delete.
- `POST /remates/{remate_id}/lotes/reorder` → recibe la lista completa y ordenada de
  `lote_id` vigentes del remate; reescribe `display_order` de todos en una única
  transacción (ver [ADR-015](adr/ADR-015-numero-de-lote-y-orden-de-exhibicion-separados.md)).

Ninguno de estos endpoints abre, cierra, cancela ni resuelve un lote — eso queda,
íntegramente, para el módulo de Ofertas.

## Qué queda para el módulo de Ofertas (próximo)

- Las transiciones `PENDING -> OPEN`, `OPEN -> CLOSED_SOLD`, `OPEN -> CLOSED_UNSOLD` y
  `(PENDING|OPEN) -> CANCELLED` de `Lote`, reutilizando `lotes/state_machine.py` tal como
  está.
- Las transiciones `SCHEDULED -> LIVE` (RF-08: exige al menos un lote), `LIVE <-> PAUSED`
  y `LIVE -> FINISHED` de `Remate`, ahora sí validables porque los lotes existen.
- El endpoint de "abrir siguiente lote" debe apoyarse en el índice único parcial ya creado
  en este módulo ([ADR-017](adr/ADR-017-invariante-un-lote-abierto-por-remate-como-indice-parcial.md))
  para la invariante RF-12, manejando su violación como conflicto de concurrencia
  esperable.
- Columnas de auditoría de cierre/cancelación de lote (`cancellation_reason`,
  `cancelled_at`, `closed_at` o equivalentes), que este módulo decidió no anticipar (ver
  arriba).
