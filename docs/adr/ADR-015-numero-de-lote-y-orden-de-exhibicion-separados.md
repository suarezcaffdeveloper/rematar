# ADR-015: Número de lote y orden de exhibición como campos independientes

- **Fecha**: 2026-07-14
- **Estado**: Aceptada

## Contexto

El enunciado del Módulo 2.2 pide, como dos ítems separados de la lista de campos mínimos,
un "número de lote" y un "orden dentro del remate". A primera vista podrían parecer el
mismo dato (el lote número 3 es, naturalmente, el tercero en orden), pero en la práctica
de un remate real no siempre coinciden: un rematador arma su catálogo con una numeración
propia (a veces heredada de un catálogo impreso, con lotes como "12", "12-A", "13 bis"
cuando se desdobla un lote después de publicado) y separadamente puede necesitar
reordenar la secuencia de exhibición en vivo (por ejemplo, adelantar un lote muy esperado
para generar expectativa, sin renumerar todo el catálogo). RF-07 exige explícitamente que
el orden sea editable de forma independiente ("Los lotes tienen un orden explícito dentro
del remate, editable mientras el remate no esté LIVE").

## Decisión

Se modelan **dos campos separados**:

- `lot_number` (`str`, hasta 20 caracteres): identificador de catálogo elegido libremente
  por el rematador al crear el lote. Único dentro del remate (constraint de base), pero
  sin ninguna relación forzada con la posición de exhibición — admite esquemas como "1",
  "12-A", "L-045".
- `display_order` (`int`): posición de exhibición dentro del remate, asignada
  automáticamente por el sistema al crear el lote (siguiente posición disponible) y
  modificable **únicamente** a través de una acción dedicada de reordenamiento
  (`POST /remates/{id}/lotes/reorder`), no a través del `PATCH` general del lote — así la
  regla de negocio "reordenar" queda como una operación atómica sobre todo el conjunto de
  lotes del remate, no como una edición de campo suelto que podría dejar dos lotes con el
  mismo orden si se editan de a uno.

## Alternativas consideradas

- **Un solo campo, numérico, que cumple ambos roles**: más simple, pero obliga a elegir
  entre catálogo y secuencia — renumerar para reordenar (rompe la numeración que el
  comprador ya vio publicitada) o forzar que el orden de exhibición siga siempre el
  catálogo (contradice RF-07, que pide reordenamiento explícito).
- **`lot_number` autogenerado y no editable, igual a `display_order`**: descartado por la
  misma razón — un catálogo real de remates argentino (campo, hacienda) suele tener
  numeración propia del rematador, a veces definida antes de cargar el sistema.
- **Constraint de unicidad de base también sobre `display_order`** (para impedir dos
  lotes con el mismo orden): se descartó a nivel de columna porque reordenar N lotes en
  una sola transacción con una constraint `UNIQUE (remate_id, display_order)` sin
  diferir (`DEFERRABLE INITIALLY DEFERRED`) requiere una estrategia de swap en dos pasos
  (mover todos a valores temporales negativos, después a los definitivos) o declarar la
  constraint como diferida — ninguna herramienta del proyecto usa constraints diferidas
  todavía y añadir la primera acá, solo para esto, es una complejidad que el propio
  endpoint de reorder ya evita por diseño (siempre reescribe la secuencia completa dentro
  de una única transacción, nunca dos lotes a la vez). Se acepta la falta de constraint de
  base y se confía en que `LoteService.reorder` es el único punto de escritura de
  `display_order`.

## Consecuencias

- **Ventajas**: el rematador puede reordenar la exhibición sin tocar la numeración de
  catálogo que ya publicó; el sistema puede reasignar `display_order` de forma densa
  (0..N-1) sin gaps ni colisiones, porque siempre se reescribe completo.
- **Desventajas aceptadas**: sin constraint de base sobre `display_order`, un bug futuro
  en `LoteService` podría, en teoría, dejar dos lotes con el mismo orden — se mitiga con
  los tests de integración de `reorder` (validan que la lista enviada sea exactamente el
  conjunto de lotes vigentes del remate, sin duplicados) pero no hay una segunda barrera a
  nivel de base. Si en el futuro esto demuestra ser insuficiente, agregar la constraint
  diferida es la evolución natural.
