# ADR-020: Diseño del Auction Engine

- **Fecha**: 2026-07-15
- **Estado**: Aceptada

## Contexto

La Épica 2.4 pide el componente más sensible del proyecto (ver
[08-riesgos-tecnicos.md](../08-riesgos-tecnicos.md), R-01): recibir, validar y procesar
ofertas sobre un lote. Tiene que ser correcto bajo alta concurrencia (el propio
enunciado: "cientos o miles de ofertas por segundo"), servir hoy por HTTP sin dejar de
ser directamente reutilizable cuando exista el canal de WebSocket, y dejar un historial
inmutable y auditable de cada intento, exitoso o no. Son varias decisiones de diseño
relacionadas entre sí; se documentan juntas en un único ADR porque forman un solo diseño
coherente, no siete decisiones independientes.

## Decisión

### A. Concurrencia: reutilizar el lock de fila de ADR-004, no rediseñarlo

Toda la lógica de aceptación/rechazo de `AuctionEngine.place_bid` corre dentro de la
transacción que abre `LoteRepository.get_by_id_for_update` (`SELECT ... FOR UPDATE`
sobre la fila del lote) — exactamente el mecanismo que
[ADR-004](ADR-004-concurrencia-en-determinacion-de-ganador.md) (Fase 0) ya había decidido
antes de que existiera código de Lotes u Ofertas para ponerlo en práctica. Es la primera
vez que ese ADR se implementa; esta decisión es ejecutarlo tal cual está escrito, no
revisarlo.

**No hace falta que `LoteService.open`/`close`/`cancel` (Módulo 2.3) tomen ningún lock
explícito para que esto sea correcto.** Postgres adquiere un lock de fila implícito
sobre cualquier `UPDATE ... WHERE id = ?`, sin importar si la transacción hizo antes un
`SELECT FOR UPDATE` o no. Esto significa que el `UPDATE` que `LoteService.close` emite al
hacer `commit()` se serializa automáticamente contra el `SELECT FOR UPDATE` explícito de
`AuctionEngine.place_bid`, en cualquier orden de llegada:

- Si una oferta ya tomó el lock cuando el rematador intenta cerrar el lote, el `UPDATE`
  del cierre espera a que la oferta termine (se acepte o se rechace) antes de aplicarse
  — la oferta que ya estaba "en cola" se resuelve primero, exactamente el comportamiento
  esperado de un remate en vivo.
- Si el cierre ya aplicó su `UPDATE` (lote pasó a `CLOSED_SOLD`/`CLOSED_UNSOLD`) antes de
  que una oferta nueva alcance a tomar el lock, esa oferta lo toma después, lee el
  estado ya cerrado, y se rechaza correctamente ("el lote ya fue cerrado").

Ninguna de las dos situaciones corrompe nada ni requiere cambiar una sola línea de
`remates`/`lotes`. Es, en la práctica, la razón principal por la que este módulo no
necesitó ninguna justificación para tocar ese dominio más allá de la función de
repositorio descripta en la sección F.

### B. Estados persistidos vs. estado derivado

`OfertaStatus` tiene cuatro valores persistidos: `ACCEPTED`, `REJECTED`, `OUTBID`,
`WINNING` — los mismos ya definidos en
[07-maquinas-de-estado.md](../07-maquinas-de-estado.md) (Fase 0). `LEADING` **no** es un
valor de este enum: ese documento ya aclaraba que es una consulta derivada, no una
columna. Acá se aprovecha al máximo esa decisión con un invariante nuevo (ver sección E):
como a lo sumo puede existir una oferta `ACCEPTED` por lote en cualquier instante, "la
oferta vigente" es literalmente "la fila con `status = ACCEPTED` de ese lote" — ni
siquiera hace falta un `ORDER BY amount DESC LIMIT 1`, un filtro por status alcanza.

### C. Rechazo persistido vs. error HTTP ("reglas duras" vs. "blandas")

Se divide la lista de motivos de rechazo del enunciado en dos categorías con
consecuencias distintas:

- **Duras** (autorización/enrutamiento — nunca generan una fila de `Oferta`, levantan
  `ForbiddenError`/`NotFoundError` como en el resto de la API): rol distinto de
  `comprador`, cuenta suspendida, remate no visible para ese usuario, lote inexistente o
  perteneciente a otro remate.
- **Blandas** (resultado de una oferta bien formada compitiendo en la subasta — generan
  una `Oferta REJECTED` con motivo, respuesta `201`): remate no `LIVE`, lote no `OPEN`,
  monto insuficiente.

Ver [docs/17-auction-engine.md](../17-auction-engine.md) para la tabla completa y el
razonamiento caso por caso.

### D. Idempotencia vía `client_token`

`Oferta.client_token` (opcional, `str`, provisto por el cliente) permite que un
reintento de red — el mismo comprador reenviando la misma oferta porque no recibió la
respuesta del intento anterior — devuelva el resultado ya persistido en vez de procesar
una oferta nueva. Es exactamente el escenario que el glosario de Fase 0 ya anticipaba
("Idempotencia: relevante para reintentos de ofertas ante fallas de red transitorias") y
se vuelve más relevante todavía pensando en WebSockets, donde las reconexiones y
reintentos de mensajes son más frecuentes que sobre HTTP simple.

La unicidad es `(buyer_id, client_token)`, no `client_token` a secas: dos compradores
distintos pueden usar el mismo valor de token sin colisionar entre sí (cada uno tiene su
propio espacio de idempotencia), y la consulta de replay (`WHERE buyer_id = ? AND
client_token = ?`) queda cubierta por el mismo índice que impone la unicidad.

El motor chequea el token **dos veces**: una vez al principio (atajo, evita competir por
el lock del lote en el caso común de un reintento genuino) y una segunda vez atrapando el
`IntegrityError` del `commit` si dos reintentos llegaron casi simultáneamente y ninguno
vio todavía la fila del otro. La segunda es la que garantiza corrección; la primera es
solo una optimización.

### E. Invariantes de base: a lo sumo una oferta `ACCEPTED` y una `WINNING` por lote

Mismo patrón que [ADR-017](ADR-017-invariante-un-lote-abierto-por-remate-como-indice-parcial.md)
(a lo sumo un lote `OPEN` por remate): dos índices únicos parciales de PostgreSQL,

```
UNIQUE (lote_id) WHERE status = 'accepted'
UNIQUE (lote_id) WHERE status = 'winning'
```

El primero es lo que hace válida la simplificación de la sección B (no puede haber
ambigüedad sobre "cuál es la oferta vigente"). El segundo protege un invariante que
todavía no es alcanzable en esta fase (nada asigna `WINNING` todavía) pero que, igual que
`ADR-017`, cuesta cero hoy y evita una migración el día que se implemente la transición
`ACCEPTED -> WINNING`.

### F. Ubicación del módulo y su único punto de contacto con `remates`/`lotes`

`Oferta` vive en `app/modules/ofertas/`, un módulo nuevo de nivel superior — no un
sub-paquete de `remates`, a diferencia de `Lote`. [09-arquitectura-y-decisiones.md](../09-arquitectura-y-decisiones.md)
(Fase 0) ya distinguía "Bidding" como módulo propio, separado de "Remates" ("ciclo de
vida de remates y lotes"); esta decisión ejecuta esa separación ya prevista, no inventa
una nueva. `Oferta.lote_id` y `Oferta.buyer_id` son FKs simples sin `relationship()` de
SQLAlchemy — mismo criterio que `Remate.owner_id -> User`.

El **único** cambio en código ya existente de `remates`/`lotes`, más allá del punto de
extensión ya establecido (`app/db/base.py`), es una función nueva y puramente aditiva en
`app/modules/remates/lotes/repository.py`: `get_by_id_for_update`, que implementa el
`SELECT ... FOR UPDATE` de la sección A. `LoteService` y `RemateService` no se modifican
en absoluto — `AuctionEngine` depende de `RemateService` (para reutilizar la visibilidad
ya resuelta, `get_visible_or_raise`) y de `LoteRepository` directamente (para el lock),
nunca de `LoteService`. Esta dirección de dependencia (`ofertas -> remates`, nunca al
revés) es la misma que ya estableció [ADR-019](ADR-019-finalizacion-automatica-de-remate.md)
para el acoplamiento `Remate -> Lote`: de solo lectura, unidireccional, sin ciclo de
imports posible.

### G. Por qué no hace falta Redis ni WebSockets para que esto sea correcto ya

Ver la sección dedicada en [docs/17-auction-engine.md](../17-auction-engine.md). En
resumen: el arbitraje (quién ganó la carrera por ofertar) lo resuelve Postgres con el
lock de fila, sin importar cuántas instancias de backend haya corriendo — es la misma
razón de [ADR-002](ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md) (Postgres
como única fuente de verdad de negocio). El rol futuro de Redis
([ADR-009](ADR-009-redis-pubsub-vs-streams-para-fanout.md)) es difundir el resultado ya
calculado a los clientes conectados, un problema completamente distinto que no afecta la
corrección del motor.

## Alternativas consideradas

- **Optimistic locking** (leer el monto vigente sin lock, escribir con `WHERE amount =
  <lo que leí>`, reintentar si falla): ya descartado explícitamente por ADR-004 para este
  mismo problema, por la misma razón (alta contención sobre un lote puntual genera
  reintentos en cascada sin ninguna ventaja real sobre el lock pesimista). No hay
  argumento nuevo en esta fase que justifique revisar esa decisión.
- **Redis como árbitro de concurrencia** (comparar y aceptar la oferta en una operación
  atómica de Redis/Lua, persistir a Postgres de forma asíncrona): también ya descartado
  por ADR-004 — introduciría una segunda fuente de verdad justo en la operación que el
  proyecto no puede permitirse tener ambigua. Sigue sin haber razón para reabrir esto.
- **Rechazo siempre como error HTTP** (422/409 para "monto insuficiente", "lote
  cerrado", etc., sin persistir nada): se descarta porque RF-18 pide explícitamente que
  toda oferta rechazada tenga "un motivo explícito" como parte del historial auditable
  (RF-25), y porque un error HTTP no tiene equivalente directo en un mensaje de
  WebSocket — el diseño elegido (siempre `201`, el resultado va en el cuerpo) es el que
  generaliza sin cambios al transporte futuro.
- **Un solo estado de "rechazo" sin distinguir duro/blando** (todo termina en una fila
  `REJECTED`, incluida la suspensión de cuenta o un lote de otro remate): se descarta
  porque mezclaría "tu cuenta no tiene permiso para esto" (un problema de identidad/
  autorización, ajeno al dominio de la subasta) con "tu oferta compitió y no alcanzó"
  (un resultado de negocio legítimo) — el resto de la API ya distingue 403/404 de
  resultados de negocio en todos los módulos anteriores; unificarlos acá rompería esa
  consistencia sin necesidad.
- **`Oferta` como sub-paquete de `remates`** (igual que `Lote`): se descarta porque
  [09-arquitectura-y-decisiones.md](../09-arquitectura-y-decisiones.md) ya distingue
  "Bidding" como módulo propio desde Fase 0 — tratarlo como parte de `remates` iría en
  contra de un límite de módulo ya decidido, no solo omitido.
- **`AuctionEngine` dependiendo de `LoteService`** (en vez de `LoteRepository`
  directamente): se descarta por la misma razón que ADR-019 — no hay ningún método de
  `LoteService` que el motor necesite (no abre, cierra ni cancela lotes), y depender del
  service completo en vez del repositorio de solo lectura necesario agregaría una
  superficie de acoplamiento sin ningún beneficio.
- **Marcar la oferta ganadora (`WINNING`) como parte de esta épica**, enganchando
  `LoteService.close` al motor: se descarta para esta fase porque el enunciado de la
  2.4 acota el alcance a recepción/validación/aceptación de ofertas, no al flujo de
  cierre de lote (que además ya tiene su propio ADR, el 018, con su propio mecanismo
  manual vigente). Se deja preparado (invariante de base ya creado) pero no se
  implementa la transición todavía.

## Consecuencias

- **Ventajas**: el motor es correcto bajo concurrencia real desde el día uno, sin
  Redis; es transporte-agnóstico y reutilizable tal cual por un futuro handler de
  WebSocket; el historial es inmutable y completo (incluidas las ofertas rechazadas,
  con motivo) sin necesitar una tabla de auditoría aparte; los reintentos de red no
  producen ofertas duplicadas.
- **Desventajas aceptadas**: el lock de fila serializa todas las ofertas de un mismo
  lote — mismo trade-off ya aceptado por ADR-004, con el mismo argumento (es la
  semántica de negocio correcta, y el volumen de contención está acotado por cuántos
  compradores compiten por ese lote puntual, no por el total de conexiones). La
  distinción dura/blanda agrega una decisión de diseño que un desarrollador nuevo debe
  aprender (no toda regla de negocio se comporta igual) — se documenta explícitamente
  acá y en docs/17 para que no sea sorpresa.
- Cuando el módulo de tiempo real exista, el trabajo pendiente es exclusivamente:
  (a) un handler de WebSocket que llame a `AuctionEngine.place_bid` con el usuario
  resuelto de la conexión, (b) publicar el resultado en Redis para fan-out, (c)
  implementar la transición `ACCEPTED -> WINNING` al cerrar un lote. Ninguno de los tres
  requiere modificar `engine.py`.
