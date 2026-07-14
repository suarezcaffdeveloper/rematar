# 03 — Requisitos Funcionales

Numerados como `RF-XX`, agrupados por módulo. Cada uno debe ser trazable a un caso de uso
de [02-roles-y-casos-de-uso.md](02-roles-y-casos-de-uso.md).

## Autenticación y usuarios

- **RF-01**: El sistema permite registro y login con email/contraseña, emitiendo un token
  de acceso de corta duración y un refresh token.
- **RF-02**: Todo usuario tiene exactamente un rol: `admin`, `rematador` o `comprador`.
- **RF-03**: El administrador puede suspender la cuenta de un rematador; un rematador
  suspendido no puede iniciar ni administrar remates, pero sus remates ya finalizados
  siguen siendo consultables (no se borra historial).

## Gestión de remates (rematador)

- **RF-04**: Un rematador puede crear un remate con título, descripción y fecha/hora
  programada.
- **RF-05**: Un remate solo puede editarse (título, descripción, fecha, lotes) mientras
  está en `DRAFT` o `SCHEDULED`. Una vez `LIVE`, su estructura de lotes queda congelada.
- **RF-06**: Un rematador puede cargar lotes a un remate propio, cada uno con: título,
  descripción, imágenes, precio inicial y incremento mínimo.
- **RF-07**: Los lotes tienen un orden explícito dentro del remate, editable mientras el
  remate no esté `LIVE`.
- **RF-08**: Un rematador puede iniciar un remate propio solo si tiene al menos un lote
  cargado.
- **RF-09**: Un rematador puede pausar y reanudar un remate propio en estado `LIVE`.
- **RF-10**: Un remate se finaliza automáticamente cuando se cierra su último lote, o
  manualmente por el rematador.
- **RF-11**: Un rematador puede cancelar un remate o un lote puntual, indicando un motivo
  obligatorio (queda en el registro de auditoría).

## Ciclo de vida de lotes

- **RF-12**: Solo puede haber un lote `OPEN` por remate a la vez.
- **RF-13**: El rematador abre el siguiente lote de forma manual (no automática): el ritmo
  del remate lo controla el rematador, igual que en un remate presencial.
- **RF-14**: El cierre de un lote puede ser manual (el rematador lo cierra) o automático
  (por vencimiento de un timer configurable, si el remate lo usa).
- **RF-15**: Al cerrar un lote, el sistema determina el ganador automáticamente: es la
  oferta válida de mayor monto vigente en ese momento. Si no hubo ofertas, el lote queda
  `UNSOLD` (no vendido).

## Bidding en tiempo real

- **RF-16**: Al unirse a un remate en vivo, un comprador recibe inmediatamente un snapshot
  del lote activo, su oferta vigente y el tiempo restante (si aplica).
- **RF-17**: Un comprador oferta a través del canal en tiempo real (WebSocket). El sistema
  valida server-side: que el lote esté `OPEN`, que el remate no esté `PAUSED`, y que el
  monto sea al menos `oferta_vigente + incremento_mínimo`.
- **RF-18**: Toda oferta rechazada devuelve al cliente que la envió un motivo explícito
  (`lote cerrado`, `remate pausado`, `monto insuficiente`, etc.), nunca un fallo silencioso.
- **RF-19**: Toda oferta aceptada se difunde en tiempo real a todos los clientes conectados
  a ese remate, incluyendo a quien queda "superado".
- **RF-20**: Si un remate tiene habilitada la extensión anti-sniping, una oferta aceptada
  dentro de los últimos N segundos de un lote con timer extiende automáticamente su cierre
  en N segundos (parámetro configurable por remate). Ver [ADR-007](adr/ADR-007-anti-sniping.md).

## Seguimiento y notificaciones

- **RF-21**: Un comprador puede seguir un remate y recibe una notificación cuando este
  inicia.
- **RF-22**: Un comprador que pierde la delantera en una oferta recibe una notificación de
  "superado" específica, además de la difusión general del evento.

## Historial y auditoría

- **RF-23**: Un comprador puede consultar su propio historial de ofertas y los remates que
  ganó.
- **RF-24**: Un rematador puede consultar el historial completo de ofertas (aceptadas y
  rechazadas) de sus propios remates.
- **RF-25**: El sistema conserva un registro inmutable de toda oferta recibida, aceptada o
  rechazada, con timestamp, usuario, lote y monto — necesario tanto para auditoría como
  para disputas de "gané / no gané" post-remate.
