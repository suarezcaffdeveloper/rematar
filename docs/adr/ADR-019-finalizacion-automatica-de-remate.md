# ADR-019: Finalización automática del remate al resolverse el último lote (RF-10)

- **Fecha**: 2026-07-14
- **Estado**: Aceptada

## Contexto

RF-10: "un remate se finaliza automáticamente cuando se cierra su último lote, o
manualmente por el rematador." Hay dos decisiones de diseño acá: **dónde** vive la lógica
que decide "ya no queda nada pendiente, hay que finalizar", y **cómo** se dispara sin
crear un acoplamiento fuerte entre `Remate` y `Lote` que contradiga el resto del proyecto
(ver, por ejemplo, la decisión de no usar `relationship()` de SQLAlchemy entre ambos,
documentada en [15-modulo-lote.md](../15-modulo-lote.md)).

## Decisión

`LoteService.close` y `LoteService.cancel`, después de resolver un lote con éxito, llaman
a un nuevo método `RemateService.try_auto_finish(remate)`. Este método:

1. Si el remate no está `LIVE`, no hace nada (no es un error — simplemente no
   corresponde: por ejemplo, si está `PAUSED`, la transición a `FINISHED` no es válida de
   todos modos según la máquina de estados de Fase 0).
2. Consulta (vía una nueva query de solo lectura en `LoteRepository`,
   `has_unresolved_lote`) si queda algún lote `PENDING` u `OPEN` en ese remate.
3. Si no queda ninguno, transiciona el remate a `FINISHED` (mismo efecto que la acción
   manual `finish`).

Es **best-effort**: nunca levanta una excepción de negocio: "todavía no corresponde
finalizar" no es un estado de error para quien llamó a `close`/`cancel`, es simplemente
que la auto-finalización no aplicó esta vez. Esto exige que `RemateService` reciba una
nueva dependencia, `LoteRepository` (de **solo lectura** — conteo/existencia de lotes),
inyectada además de su ya existente `RemateRepository`.

## Alternativas consideradas

- **La orquestación vive en el router** (el endpoint de cerrar/cancelar un lote llama
  primero a `LoteService.close`/`cancel` y después, si corresponde, a
  `RemateService.try_auto_finish`): se descarta explícitamente — el enunciado de este
  módulo pide "no quiero que los endpoints tengan reglas de negocio; las reglas deben
  vivir en los servicios correspondientes". Decidir *cuándo* auto-finalizar es, en sí
  misma, una regla de negocio (RF-10), no un detalle de transporte HTTP.
- **`RemateService` depende de `LoteService` (no solo de `LoteRepository`)**: se descarta
  por un problema real de import circular — `app/modules/remates/lotes/service.py` ya
  importa `RemateService` (para verificar ownership del remate padre en cada acción de
  lote). Si `remates/service.py` importara a su vez `remates/lotes/service.py`, Python no
  podría resolver el ciclo de imports al arrancar. `LoteRepository`
  (`app/modules/remates/lotes/repository.py`) no importa nada de `remates/service.py` ni
  de `remates/lotes/service.py`, así que inyectarla directamente en `RemateService` no
  genera ciclo, y además es semánticamente más ajustado: `Remate` solo necesita **leer**
  cuántos lotes existen y si hay alguno sin resolver, no ejecutar lógica de negocio de
  `Lote`.
- **Job en background / tarea programada que revisa periódicamente remates `LIVE` sin
  lotes pendientes**: se descarta como sobre-ingeniería — no existe ninguna infraestructura
  de workers/colas en el proyecto todavía (deliberadamente, ver
  [12-stack-tecnologico.md](../12-stack-tecnologico.md)), y el chequeo es una consulta
  trivial que ya se puede hacer de forma síncrona, en la misma transacción que cierra el
  lote, sin ninguna latencia adicional relevante.

## Consecuencias

- **Ventajas**: RF-10 queda completamente implementado (automático y manual) sin mover
  ninguna regla de negocio al router; el acoplamiento nuevo (`Remate -> LoteRepository`)
  es de solo lectura y unidireccional, no reintroduce el problema que
  [15-modulo-lote.md](../15-modulo-lote.md) evitó deliberadamente con `relationship()`.
- **Desventajas aceptadas**: `RemateService` deja de ser completamente ajeno a la
  existencia de `Lote` (antes de este módulo, ninguna línea de `remates/service.py`
  mencionaba lotes). Se acepta porque la alternativa (mover la orquestación al router)
  viola un requisito explícito de este módulo, y porque la dependencia es mínima,
  unidireccional y de solo lectura.
- Si en el futuro aparece un caso de uso de auto-finalización disparado por algo que no
  sea "se resolvió un lote" (por ejemplo, un timeout), `try_auto_finish` ya es el punto de
  extensión correcto — no hace falta rediseñarlo, solo llamarlo desde el nuevo lugar.
