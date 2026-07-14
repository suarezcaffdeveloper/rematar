# ADR-017: Invariante "a lo sumo un lote OPEN por remate" (RF-12) como índice único parcial

- **Fecha**: 2026-07-14
- **Estado**: Aceptada

## Contexto

RF-12 exige que, en cualquier instante, a lo sumo un lote de un remate esté en estado
`OPEN` (es la invariante que le permite al sistema, en fases futuras, razonar sobre "el
lote activo" sin ambigüedad — ver [07-maquinas-de-estado.md](../07-maquinas-de-estado.md)).
Este módulo (2.2) no implementa la transición que abre un lote (`PENDING -> OPEN`, la
excluye explícitamente del alcance), así que la invariante no es alcanzable todavía: todo
lote creado acá queda en `PENDING` para siempre dentro de esta fase. Aun así, hay que
decidir si el modelo de datos deja la puerta abierta a violarla el día que el módulo de
Ofertas implemente "abrir lote", o si la garantiza desde ya.

## Decisión

Se agrega, en la misma migración que crea la tabla `lotes`, un **índice único parcial de
PostgreSQL**: `UNIQUE (remate_id) WHERE status = 'open' AND deleted_at IS NULL`. Hoy no
tiene ningún efecto observable (ninguna fila puede tener `status = 'open'` porque no existe
código que la produzca), pero deja la invariante garantizada por la base de datos desde el
primer día, siguiendo el mismo principio que ya aplicó [ADR-010](ADR-010-enum-nativo-de-roles-en-postgres.md)
("no confiar únicamente en la capa de aplicación para una invariante que la base puede
garantizar").

## Alternativas consideradas

- **No agregar nada ahora, dejar que el módulo de Ofertas cree el índice cuando
  implemente "abrir lote"**: es la opción más estrictamente alineada con "no implementar
  lógica de negocio todavía" del alcance de este módulo. Se descarta porque un índice
  parcial es *estructura*, no *lógica de negocio* — no ejecuta ninguna acción, solo
  restringe qué filas son válidas — y agregarlo ahora, en la misma migración que ya crea
  la tabla y sus demás constraints, evita una migración adicional después sin anticipar
  ningún comportamiento nuevo. Es exactamente el mismo argumento que ya usó
  `Remate.finished_at` en el Módulo 2.1: una columna/constraint que una fase futura
  necesitará con certeza casi total no debería costar una migración aparte solo por
  haberse creado un módulo antes que otro.
- **Aplicar la invariante únicamente con un lock a nivel de fila** (`SELECT ... FOR
  UPDATE` sobre el remate al abrir un lote, verificando en la transacción que no haya otro
  `OPEN`, en la línea de [ADR-004](ADR-004-concurrencia-en-determinacion-de-ganador.md)):
  necesaria de todos modos para la operación de "abrir lote" en sí (evitar que dos
  llamadas concurrentes abran dos lotes distintos del mismo remate a la vez), pero no es
  sustituto del índice — un lock protege contra la escritura concurrente en el momento en
  que ocurre, mientras que la constraint de base protege contra *cualquier* forma de
  llegar a un estado inválido (un bug, un script de datos, una migración manual futura)
  para siempre, no solo en el camino feliz de la API.

## Consecuencias

- **Ventajas**: la invariante más importante del ciclo de vida de un lote queda
  garantizada por Postgres desde el modelo de datos base, sin esperar al módulo que la
  vuelve alcanzable; ese módulo futuro no necesita una migración de esquema para esto,
  solo el código que intente la transición (y maneje el error de violación de constraint
  como un conflicto de concurrencia esperable, no como un bug).
- **Desventajas aceptadas**: es una constraint sin ningún caso que la ejercite hasta que
  exista la transición `PENDING -> OPEN`; si el diseño de esa transición cambiara
  radicalmente (por ejemplo, si en el futuro se decidiera permitir más de un lote abierto
  por remate para pujas paralelas), este índice debería eliminarse explícitamente en una
  migración nueva — no es un costo alto, pero es una dependencia a tener en cuenta.
