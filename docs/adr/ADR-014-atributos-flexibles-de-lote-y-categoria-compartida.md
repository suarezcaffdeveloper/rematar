# ADR-014: Atributos flexibles de Lote como JSONB, y categoría compartida con Remate

- **Fecha**: 2026-07-14
- **Estado**: Aceptada

## Contexto

El Módulo 2.2 pide explícitamente un modelo de Lote que sirva para tipos de remate muy
distintos entre sí (ganado, maquinaria, vehículos, inmuebles, y "otros" sin enumerar de
antemano). Cada tipo tiene datos propios que no comparte con los demás: un lote de
hacienda necesita raza/peso/edad/certificado sanitario; uno de vehículos necesita
marca/modelo/año/VIN/kilometraje; uno de inmuebles necesita metros cuadrados/partida
inmobiliaria. Modelar esto ingenuamente llevaría a una tabla `lotes` con decenas de
columnas nulas para el 90% de los tipos, o a una tabla por tipo. Hay que decidir cómo
representar esos atributos variables sin acoplar el esquema de la base a cada tipo de
remate que exista hoy o que se agregue después.

Relacionado: `Lote` también necesita una categoría (RF-06 implícito, mismo espíritu que
`Remate.category`, ver [ADR-013](ADR-013-categoria-de-remate-como-enum-nativo.md)). Hay
que decidir si es la misma taxonomía de `RemateCategory` o una nueva.

## Decisión

1. **`Lote.attributes` es una columna `JSONB`** (`dict[str, str | int | float | bool]`),
   validada en el borde por Pydantic (mismo patrón que `Remate.settings`, ver
   [ADR-012](ADR-012-configuracion-de-remate-como-jsonb.md)) con un límite de cantidad de
   claves (30) y longitud de clave (100 caracteres) para evitar abuso, pero **sin**
   esquema fijo por categoría en esta fase: el rematador decide libremente qué pares
   clave/valor cargar según el tipo de lote que esté vendiendo.
2. **`Lote.category` reutiliza `RemateCategory`** (el mismo enum nativo de Postgres ya
   creado para `Remate`), no se crea un `LoteCategory` separado.

## Alternativas consideradas

- **Modelo EAV (Entity-Attribute-Value)**: una tabla `lote_atributos(lote_id, clave,
  valor)`. Es la opción "más normalizada" y permitiría, en teoría, filtrar por atributo en
  SQL (`WHERE clave = 'raza' AND valor = 'Angus'`). Se descarta para esta fase: no hay
  ningún caso de uso de búsqueda/filtro por atributo todavía (RF no lo pide), y un EAV
  agrega un JOIN y una capa de serialización/deserialización de tipos (¿el valor es texto,
  número, booleano?) que JSONB ya resuelve nativamente en Postgres sin tabla aparte. Si en
  el futuro aparece un caso de uso real de "buscar lotes de hacienda con raza=Angus y
  peso>400kg", esa necesidad puntual se resuelve con un índice funcional GIN sobre el
  JSONB o, si la búsqueda se vuelve central, promoviendo campos específicos a columnas —
  no antes.
- **Una subclase/tabla por categoría** (`LoteGanado`, `LoteVehiculo`, `LoteInmueble`, con
  herencia de tabla o `joined table inheritance` de SQLAlchemy): es la opción más "tipada"
  (cada campo con su tipo real, validación en base), pero exige una migración cada vez que
  aparece un tipo de remate nuevo — exactamente lo que el pedido de este módulo ("debe
  poder usarse para ganado, maquinaria, vehículos, inmuebles, **otros**") pide evitar. El
  catch-all `OTROS` de `RemateCategory` (ADR-013) ya anticipa que la lista de tipos no es
  cerrada.
- **`LoteCategory` propio, separado de `RemateCategory`**: se descarta por duplicar sin
  necesidad una taxonomía de 9 valores que ya existe y ya está pensada para el mismo
  dominio (remates en Argentina). Compartir el enum también deja modelar, sin esfuerzo
  extra, un remate de categoría mixta (ej. liquidación de un campo: lotes de hacienda,
  maquinaria y vehículos en el mismo evento) — el campo `category` vive en `Lote`, no
  (solo) en `Remate`, así que esto ya es posible aunque no sea el caso más común.

## Consecuencias

- **Ventajas**: agregar soporte a un tipo de remate nuevo (ej. "obras de arte" con sus
  propios atributos) no requiere ninguna migración de Alembic — es una convención de
  claves en `attributes` que se documenta y, opcionalmente, se valida en el frontend. El
  mismo mecanismo de `Remate.settings` ya está probado en el módulo anterior.
- **Desventajas aceptadas**: no hay validación de tipos por categoría (nada impide cargar
  `{"raza": "Angus"}` en un lote de categoría `vehiculos`); tampoco se puede filtrar ni
  indexar eficientemente por un atributo sin un índice funcional GIN específico. Se acepta
  porque no hay hoy un requisito funcional de búsqueda por atributo, y porque la validación
  de "qué atributos tiene sentido para cada categoría" es una regla de presentación
  (frontend) más que de integridad de datos en esta fase.
- Precedente para fases futuras: si aparece un caso de uso real de búsqueda/filtro
  estructurado por atributo, ese campo puntual se promueve a columna propia (con su
  migración), sin tener que rediseñar el resto de `attributes`.
