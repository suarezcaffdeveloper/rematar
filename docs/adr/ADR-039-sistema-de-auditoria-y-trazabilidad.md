# ADR-039: Sistema de Auditoría y Trazabilidad — escritura atada a la transacción de dominio, namespace de acciones abierto, superficies de escritura/lectura separadas

- **Fecha**: 2026-08-03
- **Estado**: Aceptada

## Contexto

El enunciado pide un Audit Service centralizado que registre las acciones importantes
de la plataforma (login/logout, CRUD de remates/lotes, apertura/cierre/adjudicación de
lotes, ofertas realizadas/rechazadas, mensajes de chat eliminados, cambios de
configuración), con un panel de consulta para administradores y rematadores, reutilizando
la infraestructura existente (Postgres, Redis, Event Bus), y explícitamente **fácil de
extender** para nuevas acciones sin modificar significativamente el código existente.

A diferencia de cualquier módulo anterior, este es el primero cuya función central es
ser una fuente de verdad *retrospectiva e inmutable*: un log de auditoría con un hueco
(una acción que ocurrió pero no quedó registrada) no cumple su propósito, sin importar
cuán infrecuente sea el hueco. Esa propiedad — nunca perder un registro — es la que
distingue las decisiones de este ADR de las de cualquier módulo de solo lectura
(Analítica, Snapshot) o de escritura best-effort (eventos de dominio, Chat).

## Decisión

### A. Escritura síncrona, en la misma transacción de la acción que audita — nunca vía el Event Bus

`EventBus.publish()` (ADR-022) es **best-effort y nunca lanza**: si Redis está caído en
el momento de publicar, el evento se pierde en silencio, por diseño — esa es
exactamente la propiedad correcta para actualizaciones en tiempo real (un cliente
puede reconciliar vía snapshot en la próxima reconexión) y exactamente la propiedad
incorrecta para un registro de auditoría (no hay "reconciliación" posible para una
entrada que nunca se escribió).

Se descartó, por esto, construir Auditoría como un consumidor del Event Bus (un
`EventConsumer` adicional, como el que Chat usa para sus mensajes de sistema, ADR-037
sección D). En su lugar, `AuditLogRepository.record(...)` se llama **directo** desde
cada servicio de dominio (`AuthService`, `RemateService`, `LoteService`,
`AuctionEngine`, `ChatService`), de forma síncrona y sin comitear, **antes** del
`commit()` que ese servicio ya iba a ejecutar para persistir su propia acción — la
entrada de auditoría queda en la misma transacción de base de datos. Si esa transacción
se revierte, no hay entrada (correcto: la acción no ocurrió); si se confirma, la
entrada se confirma con ella. Es una garantía atómica que ningún evento del Event Bus
tiene ni necesita tener.

Para las tres acciones que crean una fila nueva (`RemateService.create`,
`LoteService.create`, `AuctionEngine._save`), el `id` del recurso no existe todavía
cuando se querría auditar — es un default client-side (`uuid.uuid4()`) que SQLAlchemy
recién asigna al hacer flush. Esos tres puntos llaman `await self._audit_repository.
flush()` (asigna el id sin comitear la transacción) antes de construir la entrada de
auditoría, seguido del único `commit()` de siempre — sin agregar un segundo round-trip
a la base: el `INSERT` que el flush dispara es exactamente el mismo trabajo que el
`commit()` iba a hacer de todos modos, solo que explícito un paso antes.

### B. `action` como namespace de string abierto, no un `Enum` nativo de Postgres

ADR-010 estableció el enum nativo de Postgres como el patrón por defecto para catálogos
cerrados (`UserRole`, `RemateStatus`, etc.). Se decidió **no** aplicar ese mismo patrón
acá: un enum nativo exige una migración de Alembic (`ALTER TYPE ... ADD VALUE`) cada vez
que se agrega una acción nueva — exactamente la fricción que el enunciado pide evitar
explícitamente ("fácilmente extensible... sin modificar significativamente el código
existente"). En cambio, `AuditLogEntry.action` es una columna `String(100)`, con el
catálogo de valores válidos documentado únicamente del lado de Python
(`app/audit/actions.py::AuditAction`, constantes de string) — mismo criterio que
`DomainEvent.event_type: str` (`app/events/base.py`) ya usa para los eventos de dominio,
sin caso conocido de deriva o inconsistencia en las fases anteriores. Sumar una acción
nueva es agregar una constante en `actions.py` y una llamada a `record(...)` en el punto
del código donde ocurre — nunca una migración.

Esta decisión es también la que deja el sistema preparado para integraciones futuras
con SIEM/monitoreo externo (mencionadas en el enunciado como objetivo, no como parte de
este módulo): un exportador futuro puede leer `action` como un string arbitrario sin
necesitar conocer, en tiempo de compilación de ningún lado, el catálogo completo.

### C. `AuditLogRepository` (escritura) separado de `AuditService` (lectura) — evita un ciclo de imports

`AuditService` (la superficie de **lectura** del panel admin/rematador) necesita
`RemateService` para resolver ownership/visibilidad en `list_for_remate` — mismo patrón
que `AnalyticsService`. Si los cinco servicios de dominio que **escriben** auditoría
dependieran de ese mismo `AuditService`, se cerraría un ciclo: `RemateService` (entre
otros) ya sería una dependencia de `AuditService`, que a su vez sería una dependencia de
`RemateService`.

La solución es la misma que ADR-019 ya aplicó para un problema estructuralmente
idéntico ("`RemateService` recibe `LoteRepository`, no `LoteService`, porque
`remates/lotes/service.py` ya depende de `RemateService`"): separar la superficie sin
dependencias de dominio (`AuditLogRepository`, que solo conoce `AuditLogEntry` y
primitivas) de la que sí las tiene (`AuditService`). Los cinco servicios de dominio
dependen únicamente de `AuditLogRepository`; `AuditService` es exclusivo del router del
panel, y ningún módulo de dominio lo importa jamás —
`test_architecture_boundaries.py::test_domain_modules_only_use_audit_write_surface` lo
verifica de forma estática.

### D. FKs con `ON DELETE SET NULL`, no `RESTRICT` — al revés del criterio del resto del proyecto

Cada tabla anterior con una FK hacia una entidad "auditada" usa `RESTRICT`
(`ChatMessage.remate_id`, `Oferta.lote_id`, etc.): la fila referenciada no debe poder
desaparecer mientras exista el registro que la audita. `AuditLogEntry` invierte ese
razonamiento porque **es** el registro de auditoría, no la entidad auditada — debe ser
la tabla más tolerante posible a que `actor_id`/`remate_id` dejen de existir (hoy
ninguna operación real borra un `User` o hace hard-delete de un `Remate`, pero el
criterio queda preparado, mismo espíritu que `ChatMessage.author_id` ya aplica). `SET
NULL` nunca bloquea ni pierde una entrada.

### E. "Cambios importantes de configuración" mapeados explícitamente a `Remate.settings`

El proyecto no tiene (ni este módulo agrega) un módulo de configuración global: la única
superficie de "configuración" que existe hoy es `Remate.settings` (JSONB, ADR-012,
anti-sniping). Se decidió auditar explícitamente ese caso con una acción propia
(`remate.settings_changed`, distinta de `remate.updated`) en vez de inventar un
mecanismo de configuración global ficticio solo para satisfacer este ítem del
enunciado — brecha documentada, mismo criterio que la Épica 6.1 documentó antes de
agregar el único endpoint nuevo de esa fase.

### F. Panel en tarjetas y línea de tiempo, agrupado por día — nunca una tabla

Pedido explícito de diseño del enunciado ("evitar tablas excesivamente cargadas").
`AuditLogTimeline` agrupa las entradas ya ordenadas (por el filtro "Orden", nunca
reordenadas en el cliente) en encabezados de día; cada entrada es una tarjeta
(`AuditLogEntryCard`) con hora, acción (badge de color por tipo), actor+rol, y un
detalle expandible (el JSON libre de `details`) — colapsado por defecto, porque la
mayoría de las entradas se escanean por su resumen, no por el detalle completo.

### G. Paginación offset/limit, no keyset

A diferencia de Chat (`ChatMessageRepository`, paginación keyset por "miles de
mensajes" con scroll infinito, ADR-037), el volumen esperado de un panel administrativo
es bajo y el patrón de uso es "filtrar y hojear", no "scroll infinito hacia atrás" —
offset/limit (mismo patrón que `RemateRepository.list_for_viewer`/
`OfertaRepository.list_by_lote`) alcanza sin la complejidad adicional de una comparación
row-wise.

## Alternativas consideradas

- **Segundo `EventConsumer`, como Chat**: descartada, ver sección A — el Event Bus es
  best-effort por diseño, incompatible con la garantía de "nunca perder un registro"
  que un log de auditoría necesita.
- **Enum nativo de Postgres para `action`**: descartada, ver sección B — reintroduce
  exactamente la fricción de extensibilidad que el enunciado pide evitar.
- **Un único `AuditService` para leer y escribir**: descartada, ver sección C — cierra
  un ciclo de imports con `RemateService`.
- **`RESTRICT` en las FKs, mismo criterio que el resto del proyecto**: descartada, ver
  sección D — el razonamiento se invierte porque acá la tabla *es* la auditoría.
- **Módulo de configuración global nuevo**, solo para tener algo que auditar como
  "cambio de configuración": descartada, ver sección E — alcance no pedido, se prefiere
  la brecha documentada.

## Consecuencias

- **Ventajas**: ninguna acción auditada puede perderse por una falla de Redis o de un
  consumidor de fondo (la garantía central del módulo); sumar una acción nueva a
  futuro es una constante + una llamada, sin migración; el módulo se integró sin tocar
  `app/realtime/`, el Gateway WebSocket, `RoomManager`/`ConnectionManager`,
  `app/presence/` ni `app/snapshot/`, y sin modificar ninguna regla de negocio existente
  de remates/lotes/ofertas/chat — cada servicio de dominio solo ganó un parámetro de
  constructor y una llamada antes de un `commit()` que ya existía.
- **Desventajas aceptadas**: tocar cinco servicios de dominio existentes (mismo costo
  mecánico que agregar `event_bus` tuvo en la Épica 3.2) — es aditivo, pero no es un
  cambio de un solo archivo; sin exportación real a un SIEM externo en este módulo
  (preparado, no construido); sin picker de usuario por id en los filtros del frontend
  (la búsqueda por nombre cubre el caso de uso sin esa pieza nueva).
- Auditar una acción nueva a futuro (por ejemplo, cambios en `Lote.attributes`) es:
  una constante en `actions.py`, una llamada a `record(...)` en el servicio
  correspondiente (antes de su `commit()` existente) — sin reabrir el modelo, el
  control de acceso, la paginación ni el panel del frontend, que son genéricos sobre
  cualquier valor de `action`/`resource_type`.
