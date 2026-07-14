# ADR-016: Precio de reserva oculto para compradores

- **Fecha**: 2026-07-14
- **Estado**: Aceptada

## Contexto

El precio de reserva (`reserve_price`) es el monto mínimo que el rematador está
dispuesto a aceptar por un lote; si el remate se cierra sin alcanzarlo, el lote queda
`CLOSED_UNSOLD` (esto lo implementará el módulo de Ofertas, no este). Es un dato estándar
de la industria de remates y, tanto en remates presenciales como en plataformas online
equivalentes, **nunca se revela a los compradores** mientras el lote sigue en juego:
conocerlo de antemano le da a un comprador información que puede usar para ofertar
exactamente el mínimo necesario en el último segundo, en vez de competir de buena fe. Hay
que decidir si el modelo/API de este módulo ya contempla esa restricción o la deja para
cuando exista bidding.

## Decisión

`reserve_price` se persiste siempre (columna normal, sin cifrado ni ofuscación — el
rematador dueño y el administrador necesitan verlo siempre), pero el **service** nulea el
valor en el objeto devuelto por lectura (`get_visible_or_raise` y `list_for_viewer`)
cuando quien consulta no es el rematador dueño del remate ni un administrador. Un
comprador que pide el detalle de un lote recibe `"reserve_price": null` en la respuesta,
nunca el monto real ni un error — el campo existe en el contrato de la API, simplemente no
se completa para ese tipo de usuario.

## Alternativas consideradas

- **Dos schemas de lectura distintos** (`LoteRead` completo para dueño/admin,
  `LotePublicRead` sin el campo para el resto): más "correcto" en el sentido de que un
  comprador ni siquiera ve la clave `reserve_price` en el JSON. Se descarta por ahora
  porque duplica el contrato de un recurso que, en todo lo demás, es idéntico para ambos
  tipos de consumidor, y porque `response_model` de FastAPI se fija por endpoint, no por
  usuario autenticado — soportar dos formas de respuesta en el mismo endpoint según el
  rol exige construir la respuesta a mano en el router en vez de dejar que FastAPI la
  infiera del tipo de retorno, perdiendo la validación automática. Si en el futuro el
  contrato público y privado divergen en más de un campo, esta alternativa se vuelve la
  correcta y este ADR queda superado.
- **No exponer el campo en absoluto para nadie a través de la API de lectura** (solo
  quedaría accesible internamente): descartado — el rematador dueño necesita ver y editar
  su propio precio de reserva, y RF exige que el rematador consulte cualquier dato de sus
  propios lotes.
- **Exponer un booleano derivado** (`has_reserve_price: bool`) en vez de nulear el campo:
  es una alternativa razonable que da algo de información sin revelar el monto exacto. Se
  descarta por ahora por no estar pedida por ningún requisito, y porque agregar un campo
  derivado nuevo es más fácil de sumar después (no rompe nada) que quitar uno ya expuesto.

## Consecuencias

- **Ventajas**: un único schema (`LoteRead`) sirve para todos los consumidores del
  recurso, sin duplicar el contrato de la API; la ocultación queda centralizada en un solo
  método del servicio (`_mask_reserve_price`), fácil de auditar y de testear
  explícitamente.
- **Desventajas aceptadas**: un cliente que inspecciona la forma del JSON puede inferir
  "este lote tiene precio de reserva" si en algún momento ve el campo con un valor no nulo
  siendo dueño/admin y luego nulo siendo comprador — no es una fuga real (no revela el
  monto) pero sí confirma la existencia de una reserva, algo que ya es sabido/esperable en
  el dominio de remates y no se considera sensible.
- Este mismo mecanismo (nulear en el service según el viewer, no en el schema) es el
  precedente a seguir si en fases futuras aparece otro campo con visibilidad condicional
  por rol (por ejemplo, datos de contacto del rematador antes de que el remate esté
  programado).
