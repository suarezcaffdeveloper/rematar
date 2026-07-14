# 14 — Módulo Remate (Épica 2, Módulo 2.1)

Este documento es la referencia de diseño de la entidad `Remate` para todas las fases
futuras (Lotes, Ofertas) que la extiendan. Complementa, no reemplaza, lo ya definido en
Fase 0 ([02](02-roles-y-casos-de-uso.md), [03](03-requisitos-funcionales.md),
[07](07-maquinas-de-estado.md)).

## Alcance de este módulo

Se modela únicamente la entidad `Remate`, con CRUD completo, permisos y su ciclo de vida
de estados — sin ninguna relación hacia Lotes ni Ofertas. Un remate existe y es
plenamente funcional (se crea, edita, programa, cancela) sin tener un solo lote cargado.

## Campos del modelo: justificación y obligatoriedad

| Campo | Obligatorio | Por qué |
|---|---|---|
| `owner_id` | Sí (derivado del token, no del body) | El dueño nunca lo elige el cliente — se toma del usuario autenticado, para que sea imposible crear un remate a nombre de otro rematador. |
| `title` | Sí, siempre | Un remate necesita un nombre para existir y ser referenciado, incluso en borrador. |
| `category` | Sí, siempre | Es la base del descubrimiento/filtrado de remates (RF implícito de "explorar remates"); sin categoría, un listado público no es útil. Ver [ADR-013](adr/ADR-013-categoria-de-remate-como-enum-nativo.md) sobre por qué es un enum y no texto libre. |
| `status` | Sí, sistema (default `draft`) | Nunca lo setea el cliente directamente; cambia solo a través de las acciones `schedule`/`cancel` (y, en fases futuras, `start`/`pause`/`resume`/`finish`). |
| `settings` | Sí, con default | Ver [ADR-012](adr/ADR-012-configuracion-de-remate-como-jsonb.md). Tiene valores por defecto razonables (`ARS`, anti-sniping deshabilitado) para que crear un remate no obligue a pensar en configuración avanzada de entrada. |
| `description` | No | Enriquece la ficha pública, pero no bloquea nada — un rematador puede ir completándola mientras arma el borrador. |
| `cover_image_url` | No | Igual que la descripción: mejora la presentación, no es funcionalmente necesaria. Modelada como URL a un recurso externo — este módulo no incluye subida/almacenamiento de imágenes (eso es infraestructura de archivos, fuera de alcance aquí, similar en espíritu a por qué Fase 0 dejó el streaming de video fuera del MVU). |
| `location` | No | Texto libre (ej. "Pergamino, Buenos Aires"). Se descartó modelar una dirección estructurada (ciudad/provincia/lat-lng) porque eso solo se justifica cuando exista un requisito real de búsqueda geográfica — no lo hay todavía. Es la evolución natural si se agrega "buscar remates cerca mío". |
| `starts_at` | No al crear; **sí para programar** | Un borrador puede no tener fecha decidida todavía. `RemateService.schedule` exige que esté presente y sea futura antes de permitir `DRAFT -> SCHEDULED`. |
| `ends_at` | No, nunca (pedido explícito) | Es una estimación informativa para el comprador, no algo que el sistema necesite para funcionar — el fin real de un remate lo determina el cierre del último lote (`finished_at`, todavía no alcanzable en este módulo). |
| `cancellation_reason`, `cancelled_at` | No (se completan solo al cancelar) | RF-11 exige motivo obligatorio al cancelar; se modelan como columnas de la propia fila (no una tabla de auditoría aparte) porque un remate se cancela, a lo sumo, una vez en su vida. |
| `finished_at` | No (todavía inalcanzable) | La columna ya existe para que agregar la transición a `FINISHED` en el módulo de Lotes no requiera una migración nueva. |
| `deleted_at` | No (soft delete) | Ver más abajo. |
| `created_at`, `updated_at` | Sistema | `TimestampMixin`, reusado sin cambios de Fase 1. |

## Por qué soft delete

Un rematador puede arrepentirse de un remate en cualquier estado. Pero un remate que ya
fue `SCHEDULED` (visible públicamente) o más allá tiene valor de auditoría — un
comprador pudo haberlo seguido o, en fases futuras, haber ofertado. Por eso:

- `DELETE /remates/{id}` **solo** está permitido en estado `DRAFT` (nadie fuera del
  dueño llegó a verlo nunca) y hace un soft delete real (`deleted_at`).
- Para cualquier estado posterior, la única baja posible es `cancel` (con motivo
  obligatorio), que conserva el registro completo. Eliminar y cancelar son operaciones
  distintas a propósito, no la misma acción con dos nombres.

## Estados y transiciones implementadas en esta fase

Los seis estados son los ya definidos en Fase 0
([07-maquinas-de-estado.md](07-maquinas-de-estado.md)): `DRAFT`, `SCHEDULED`, `LIVE`,
`PAUSED`, `FINISHED`, `CANCELLED`. No se agregó ni se quitó ninguno — el diseño original
ya era correcto y completo para lo que este módulo necesita.

`app/modules/remates/state_machine.py` modela **las seis transiciones completas** (tabla
`ALLOWED_TRANSITIONS`), pero esta fase solo expone por HTTP:

- `POST /remates` → crea en `DRAFT`.
- `POST /remates/{id}/schedule` → `DRAFT -> SCHEDULED`, validando que `starts_at` exista
  y sea futuro.
- `POST /remates/{id}/cancel` → cualquier estado no terminal `-> CANCELLED`, con motivo
  obligatorio.

**Deliberadamente no se exponen todavía** `start` (`-> LIVE`), `pause`/`resume`
(`<-> PAUSED`) ni `finish` (`-> FINISHED`). Razón: RF-08 (Fase 0) exige que un remate
solo pueda iniciarse si tiene al menos un lote cargado, y el Módulo 2.1 excluye
explícitamente a Lotes. Implementar "iniciar remate" sin poder validar esa precondición
sería construir la mitad de una regla de negocio — es mejor no exponer la acción que
exponerla incompleta. Cuando el módulo de Lotes exista, agregar esas transiciones es
extender `RemateService` con nuevos métodos que llaman a la misma
`assert_transition_allowed` ya escrita; no hace falta rediseñar nada de esto.

## Reglas de visibilidad y permisos

| Quién | Puede ver | Puede crear | Puede modificar/programar/cancelar/eliminar |
|---|---|---|---|
| Rematador, dueño del remate | Cualquier estado, propio | Sí (rol `rematador`) | Sí, propio únicamente |
| Rematador, remate ajeno | Solo si no está en `DRAFT` | — | No (403) |
| Comprador | Solo remates que no estén en `DRAFT` | No (403) | No (403) |
| Administrador | Todos, cualquier estado | No (403) — solo visualiza, según el enunciado de este módulo | No (403) |

Detalle importante: un borrador ajeno (de otro rematador) o de cualquier rematador visto
por un comprador devuelve **404, no 403**. La razón es deliberada: un comprador o un
rematador que no es dueño no debería ni enterarse de que ese borrador existe. Confirmar
su existencia con un 403 ("existe pero no podés verlo") ya sería una fuga de información
menor. Ver `RemateService.get_visible_or_raise`.

## Decisiones de arquitectura nuevas de este módulo

- [ADR-012](adr/ADR-012-configuracion-de-remate-como-jsonb.md): la configuración general
  del remate (anti-sniping, moneda) se guarda como JSONB validado por Pydantic en el
  borde de la API, no como columnas sueltas — para poder crecer sin migraciones mientras
  no haga falta filtrar por esos campos en SQL.
- [ADR-013](adr/ADR-013-categoria-de-remate-como-enum-nativo.md): la categoría es un enum
  nativo de PostgreSQL, mismo patrón que los roles de usuario en Fase 1 (ADR-010).

Además, sin llegar a ameritar un ADR propio, quedan documentadas acá dos decisiones de
diseño menores:

- **Sin `relationship()` de SQLAlchemy hacia `User`**: `Remate.owner_id` es una FK
  simple. El módulo `remates` no importa comportamiento ORM de `users`, solo referencia
  su tabla por id. Esto mantiene real, en el código, el límite de módulo que
  [ADR-001](adr/ADR-001-modular-monolito-vs-microservicios.md) (Fase 0) pide a nivel de
  arquitectura general.
- **Sin campo `is_public` explícito**: la visibilidad pública se deriva de `status !=
  DRAFT`, no de un booleano aparte. Se evitó introducir un concepto (remates
  privados/invitación) que nadie pidió; si aparece ese caso de uso, es una decisión de
  producto nueva, no una que debamos anticipar sin un requisito real.

## Qué queda para el módulo de Lotes (próximo)

- Relación `Lote.remate_id` (FK), con la invariante "a lo sumo un lote `OPEN` por
  remate" (RF-12).
- Las transiciones `start`, `pause`, `resume`, `finish` de `Remate`, ahora sí validables
  contra la existencia de lotes.
- Reglas de congelamiento de estructura: RF-05 dice que un remate solo se edita en
  `DRAFT`/`SCHEDULED` — eso ya está implementado acá (`RemateService.update`), y aplica
  igual una vez que existan lotes (no hace falta tocarlo).
