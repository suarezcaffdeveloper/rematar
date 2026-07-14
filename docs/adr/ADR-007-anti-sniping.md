# ADR-007: Anti-sniping — extensión automática de cierre de lote

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

El pedido original no menciona esta funcionalidad explícitamente, pero surge como una
consecuencia natural de diseñar bidding en tiempo real con cierre por timer: si un lote
tiene un cierre programado, un comprador podría ofertar justo en el último instante para
que nadie más tenga tiempo de reaccionar ("sniping"), lo cual es percibido como injusto y
es un problema conocido en cualquier sistema de subastas con temporizador.

## Decisión

Cuando un remate tiene habilitada esta opción, si llega una oferta válida dentro de los
últimos N segundos configurables antes del cierre programado de un lote, el cierre se
extiende automáticamente N segundos más. Esto se repite mientras sigan entrando ofertas
dentro de esa ventana, hasta que pase un período sin nuevas ofertas y el lote cierre
naturalmente (o el rematador lo cierre manualmente en cualquier momento, lo cual siempre
tiene precedencia).

## Alternativas consideradas

- **No implementar anti-sniping, cierre por timer estricto**: más simple, pero dado que el
  cierre por timer es una opción del sistema (RF-14 permite cierre automático), dejarlo sin
  esta mitigación reproduce un problema de UX conocido y evitable a bajo costo.
- **Cierre exclusivamente manual, sin timer** (el rematador siempre decide cuándo cerrar):
  elimina el problema de raíz, pero le quita al sistema una funcionalidad que demuestra
  manejo de temporizadores del lado servidor — valioso para los objetivos técnicos del
  proyecto. Se mantiene el cierre manual como opción (RF-13 dice que abrir es siempre
  manual; cerrar puede ser manual o por timer), y anti-sniping aplica solo cuando el
  rematador elige usar cierre por timer.

## Consecuencias

- **Ventajas**: mitiga un problema de UX real y conocido en subastas con temporizador, a un
  costo de implementación bajo (un chequeo adicional al aceptar una oferta: ¿estamos dentro
  de la ventana de extensión?).
- **Desventajas aceptadas**: en teoría, una sucesión de ofertas de último segundo podría
  extender un lote indefinidamente. Se acepta este riesgo menor porque el rematador
  siempre puede cerrar manualmente el lote en cualquier momento (RF-13 mantiene esa
  precedencia), lo cual actúa como límite práctico.
- Esta funcionalidad depende de que el estado del timer del lote viva en Postgres, no en
  memoria de una instancia (ver R-13 en [08-riesgos-tecnicos.md](../08-riesgos-tecnicos.md)),
  para que cualquier instancia pueda evaluar correctamente si corresponde extender.
