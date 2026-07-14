# 02 — Roles y Casos de Uso

## Roles del sistema

### Administrador

Responsable de la operación global de la plataforma, no de un remate en particular.

- Gestionar cuentas de rematadores: alta, suspensión (por fraude o incumplimiento).
- Ver todos los remates de la plataforma (solo lectura sobre el contenido de negocio).
- Acceso a métricas y auditoría globales.
- **No** participa del negocio de un remate puntual: no oferta, no administra lotes ajenos.
  Mezclar esto rompería el aislamiento multi-tenant y generaría un conflicto de intereses
  obvio (el admin viendo ofertas en tiempo real de remates que no le pertenecen).

### Rematador

Dueño exclusivo de sus remates. Aislamiento estricto respecto a otros rematadores: ninguna
acción de un rematador puede leer ni mutar datos de un remate ajeno.

- Crear, editar (solo mientras el remate está en `DRAFT` o `SCHEDULED`) y cancelar remates
  propios.
- Cargar lotes: precio inicial, incremento mínimo, imágenes, descripción, orden.
- Iniciar, pausar, reanudar y finalizar remates propios.
- Abrir y cerrar lotes propios dentro de un remate en curso.
- Ver el historial completo de ofertas (aceptadas y rechazadas) de sus propios remates.

### Comprador

- Descubrir remates públicos (en vivo, programados, finalizados).
- Unirse a un remate y recibir el estado actual (lote activo, oferta vigente) al conectarse.
- Ofertar sobre el lote abierto, respetando el incremento mínimo vigente.
- Seguir remates de interés para recibir notificaciones (inicio, próximo lote).
- Consultar su propio historial de ofertas y remates ganados.

## Nota de diseño: ¿alcanzan 3 roles?

Para el alcance actual, sí. Si la plataforma creciera y el Administrador necesitara delegar
la revisión de fraude o denuncias sin dar acceso total de admin, aparecería un cuarto rol,
**Moderador** — se deja anotado en el roaduap ([13-mvp-y-roadmap.md](13-mvp-y-roadmap.md))
y no se agrega ahora: un rol sin casos de uso reales todavía es sobre-ingeniería.

## Casos de uso

| ID | Actor | Caso de uso | Notas |
|---|---|---|---|
| CU-01 | Rematador | Crear remate | Estado inicial `DRAFT` |
| CU-02 | Rematador | Cargar lote a un remate en `DRAFT`/`SCHEDULED` | Orden explícito entre lotes |
| CU-03 | Rematador | Programar remate (fijar fecha) | `DRAFT` → `SCHEDULED` |
| CU-04 | Rematador | Iniciar remate | `SCHEDULED` → `LIVE` |
| CU-05 | Rematador | Abrir el siguiente lote | `PENDING` → `OPEN`, solo uno abierto a la vez por remate |
| CU-06 | Rematador | Cerrar el lote abierto | `OPEN` → `CLOSED_*`; dispara CU-16 |
| CU-07 | Rematador | Pausar remate en vivo | `LIVE` → `PAUSED`; bloquea nuevas ofertas |
| CU-08 | Rematador | Reanudar remate pausado | `PAUSED` → `LIVE` |
| CU-09 | Rematador | Finalizar remate | Cuando no quedan lotes pendientes; `LIVE` → `FINISHED` |
| CU-10 | Rematador | Cancelar remate o un lote puntual | Con motivo obligatorio, para auditoría |
| CU-11 | Rematador | Consultar historial de ofertas de sus remates | Incluye rechazadas |
| CU-12 | Comprador | Unirse a un remate en vivo | Recibe snapshot del estado actual (ver [ADR-008](adr/ADR-008-snapshot-mas-delta-para-reconexion.md)) |
| CU-13 | Comprador | Ofertar sobre el lote abierto | Validación server-side de incremento mínimo y estado |
| CU-14 | Comprador | Seguir un remate | Habilita notificaciones de inicio/próximo lote |
| CU-15 | Comprador | Consultar su historial de ofertas y remates ganados | |
| CU-16 | Comprador | Reconectarse tras una caída de red sin perder contexto | Snapshot + reanudación del stream de eventos |
| CU-17 | Administrador | Suspender un rematador por actividad sospechosa | No accede al detalle de ofertas de sus remates para hacerlo |
| CU-18 | Sistema | Determinar automáticamente el ganador al cerrar un lote | Transaccional, ver [ADR-004](adr/ADR-004-concurrencia-en-determinacion-de-ganador.md) |
| CU-19 | Sistema | Extender automáticamente el cierre de un lote ante una oferta de último momento | Anti-sniping, ver [ADR-007](adr/ADR-007-anti-sniping.md) |
| CU-20 | Sistema | Difundir en tiempo real cada evento relevante a todos los clientes conectados a ese remate | Ver [06-eventos-del-sistema.md](06-eventos-del-sistema.md) |
