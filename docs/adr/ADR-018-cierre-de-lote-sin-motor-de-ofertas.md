# ADR-018: Cierre de lote sin motor de ofertas — resultado declarado por el rematador

- **Fecha**: 2026-07-14
- **Estado**: Aceptada

## Contexto

RF-15 (Fase 0) dice: "al cerrar un lote, el sistema determina el ganador automáticamente:
es la oferta válida de mayor monto vigente en ese momento. Si no hubo ofertas, el lote
queda `UNSOLD`". Esa determinación automática depende de que existan ofertas — y el
Módulo 2.3 excluye explícitamente Ofertas/bidding. Aun así, el enunciado de este módulo
pide, como acción concreta del rematador, "cerrar un lote". Hay que decidir qué significa
"cerrar" cuando el sistema todavía no tiene forma de saber si algo se vendió.

## Decisión

`LoteService.close` recibe el resultado **explícitamente**, declarado por el rematador:
un `outcome` (`sold` o `unsold`) y, solo si `sold`, un `final_price` (obligatorio, no
puede ser menor a `base_price`). Se agregan a `Lote` las columnas `final_price` (nullable,
`Numeric(14,2)`) y `closed_at` (nullable, timestamp). La transición de estado en sí
(`OPEN -> CLOSED_SOLD` / `OPEN -> CLOSED_UNSOLD`) es la misma que ya modelaba
`lotes/state_machine.py` desde el Módulo 2.2, sin cambios.

Cuando exista el módulo de Ofertas, la forma de invocar `close` cambia (el propio sistema
calculará `outcome`/`final_price` a partir de la oferta vigente, en vez de recibirlos como
input de un endpoint), pero el método de servicio y la validación de estado no necesitan
rediseñarse — el "cómo se decide el resultado" queda desacoplado de "cómo se aplica el
resultado".

## Alternativas consideradas

- **`close` siempre resulta en `CLOSED_UNSOLD`, sin aceptar `sold` hasta que exista
  bidding real**: es la opción más purista respecto al alcance ("nada de lógica de
  ofertas"), pero deja "cerrar un lote" casi sin utilidad real — un rematador llevando un
  remate híbrido (parte presencial, parte plataforma) no podría registrar una venta
  ocurrida fuera del sistema de ofertas todavía inexistente. Se descarta: la acción
  explícitamente pedida por el enunciado ("cerrar un lote") pierde sentido si nunca puede
  terminar en una venta.
- **No agregar `final_price`/`closed_at` ahora, dejarlo para el módulo de Ofertas**: mismo
  argumento que [ADR-017](ADR-017-invariante-un-lote-abierto-por-remate-como-indice-parcial.md)
  — la necesidad ya es cierta hoy (este módulo cierra lotes), no hipotética; postergarla
  solo forzaría una migración adicional exactamente cuando Ofertas la necesite de todos
  modos.
- **Guardar un `winner_id` o cualquier referencia a comprador**: descartado explícitamente
  — el enunciado pide "no quiero lógica relacionada con compradores". `final_price` es un
  monto, no una relación con un usuario; no hay ningún campo en este módulo que identifique
  a un comprador.
- **Exigir `final_price >= reserve_price` cuando el lote tiene precio de reserva**: se
  descarta la validación automática porque el rematador puede, a su criterio, aceptar una
  venta por debajo de la reserva (práctica real y legítima de un rematador que decide
  vender igual) — la única validación dura es contra `base_price` (un precio final menor
  al precio de arranque no tiene sentido en una subasta ascendente).

## Consecuencias

- **Ventajas**: "cerrar un lote" es una acción completa y útil desde este módulo, sin
  esperar a Ofertas; los datos de cierre (precio final, timestamp) quedan disponibles para
  auditoría inmediatamente; la migración que agrega estas columnas no se repite después.
- **Desventajas aceptadas**: en esta fase, nada impide que un rematador declare `sold` con
  un `final_price` que no corresponde a ninguna oferta real (no hay bidding que lo
  contraste) — es un problema de integridad de datos aceptado temporalmente, inherente a
  operar sin motor de ofertas todavía, no un defecto de este módulo.
- Cuando el módulo de Ofertas exista, su lógica de "determinar ganador" llama a
  `LoteService.close` con los valores que calculó, no reimplementa la transición de
  estado.
