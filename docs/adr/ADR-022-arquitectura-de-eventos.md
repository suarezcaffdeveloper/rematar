# ADR-022: Arquitectura de eventos de dominio — Event Bus interno sobre Redis Pub/Sub

- **Fecha**: 2026-07-17
- **Estado**: Aceptada

## Contexto

El sistema necesita, a partir de la próxima épica, que clientes conectados por
WebSocket se enteren en tiempo real de lo que pasa en un remate (empezó, un lote se
abrió, una oferta fue aceptada, etc.). Conectar esa necesidad directamente al dominio
(que `RemateService`/`LoteService`/`AuctionEngine` llamen código de WebSockets) los
acoplaría a un transporte concreto y a saber quién los consume — exactamente lo que
Fase 0 ya evitó al diseñar `Realtime/Conexiones` como módulo separado de `Bidding`/
`Remates` ([09-arquitectura-y-decisiones.md](../09-arquitectura-y-decisiones.md)). Hay
que decidir cómo el dominio anuncia "esto pasó" sin saber ni que WebSockets existe.

## Decisión

### A. El dominio publica eventos tipados a través de un `EventBus` abstracto

`RemateService`, `LoteService` y `AuctionEngine` reciben un `event_bus: EventBus` en su
constructor (mismo patrón de inyección que ya usan para sus repositorios) y llaman a
`await self._event_bus.publish(evento)` al final de cada transición relevante.
`EventBus` es un `Protocol` (PEP 544, tipado estructural) con un único método:

```python
class EventBus(Protocol):
    async def publish(self, event: DomainEvent) -> None: ...
```

El dominio nunca importa Redis ni conoce cuántos (o si algún) suscriptor existe.

### B. Los eventos son clases Pydantic concretas, no `dict`/strings

`DomainEvent` (base) fija `event_id`, `occurred_at` y `event_type` (este último con
`Literal["..."]` en cada subclase, patrón de discriminated union). `RemateScopedEvent`
(también base, agrega `remate_id` y calcula `topic`). Cada evento concreto
(`RemateCreated`, `LoteOpened`, `OfertaAccepted`, etc.) es una clase con sus propios
campos tipados, viviendo en el módulo de dominio al que pertenece
(`app/modules/remates/events.py`, `.../lotes/events.py`, `app/modules/ofertas/events.py`)
— la base compartida (`DomainEvent`/`RemateScopedEvent`) vive en `app/events/`,
transversal, igual que `app/db/mixins.py` provee mixins que cada modelo de dominio usa
sin que `db/` conozca `Remate`/`Lote`/`Oferta`.

### C. Un canal de Pub/Sub por remate, no uno por tipo de evento

`RemateScopedEvent.topic` siempre es `f"events.{remate_id}"`. Todos los eventos de un
mismo remate — sea `RemateStarted`, `LoteOpened` u `OfertaAccepted` — se publican en el
mismo canal. Ver "Alternativas consideradas" para por qué no un canal por tipo de
evento.

### D. `publish` nunca lanza — best-effort, extensión de ADR-002

`RedisEventBus.publish` (`app/events/redis_bus.py`) captura cualquier excepción interna
(Redis caído, timeout, lo que sea) y solo la registra por log — jamás la deja
propagarse. El resultado de una acción de negocio (`remate.status = LIVE`, ya
confirmado en Postgres) no puede quedar condicionado a que Redis esté disponible en ese
instante. Es la misma decisión que ya tomó
[ADR-002](ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md) para el sistema en
general, aplicada ahora al punto de código específico donde el dominio toca Redis por
primera vez.

### E. El evento se publica después del `commit`, nunca antes

En cada método modificado, la llamada a `event_bus.publish(...)` es la **última**
instrucción, siempre después de `await self._repository.commit()` (y su `refresh`
correspondiente). Publicar antes del commit podría anunciar algo que la transacción
todavía puede revertir — el evento debe representar un hecho ya consumado, no una
intención.

### F. Único cambio permitido en el dominio existente: agregar la publicación

`RemateService`, `LoteService`, `AuctionEngine` y sus `dependencies.py` son los únicos
archivos de dominio tocados en este módulo, y el único tipo de cambio aplicado fue: (1)
agregar `event_bus` al constructor, (2) agregar una llamada a `publish(...)` al final de
los métodos correspondientes al catálogo de eventos. Ninguna validación, regla de
negocio, firma de método público ni mensaje de error existente cambió — verificable
porque la suite de tests de los Módulos 2.1 a 2.4, escrita antes de este ADR, sigue
pasando sin modificaciones.

## Alternativas consideradas

- **Un canal de Redis por tipo de evento** (`events.remate.started`,
  `events.lote.opened`, ...): es el diseño "más normalizado" a primera vista, pero un
  cliente de WebSocket mirando un remate puntual necesitaría suscribirse a los ~14
  canales existentes (y a cualquiera que se agregue después) y cruzarlos por
  `remate_id` del lado del cliente. Un canal por remate es exactamente la granularidad
  que ese caso de uso necesita, y es trivial de derivar: cualquier evento nuevo que se
  agregue automáticamente queda disponible en el canal correcto sin que el consumidor
  tenga que enterarse de su existencia de antemano.
- **Eventos como `dict`/JSON armado a mano en cada service**: se descarta explícitamente
  — el enunciado pide "objetos bien definidos... no strings sueltos". Un `dict` no da
  ninguna garantía de forma en tiempo de desarrollo (typos en claves, campos faltantes
  detectados recién en producción); una clase Pydantic con campos tipados sí, y además
  se serializa a JSON gratis (`model_dump_json()`).
- **`EventBus` como clase abstracta (ABC) en vez de `Protocol`**: alternativa
  razonable y más cercana al estilo de otros lenguajes; se prefiere `Protocol` porque no
  fuerza herencia (una implementación de test o futura no necesita heredar de nada, solo
  tener el método `publish`) y porque el proyecto no usa herencia de interfaces en
  ningún otro lado — introducir ABCs acá sería un patrón nuevo sin necesidad real,
  mientras que `Protocol` es la forma más liviana de expresar "esta dependencia es
  reemplazable" sin imponer una jerarquía de clases.
- **`publish` propaga sus errores y cada service los atrapa individualmente**: se
  descarta — repetir el mismo `try/except` alrededor de ~15 llamadas a `publish()` es
  exactamente el tipo de duplicación que este ADR quiere evitar, y aumenta el riesgo de
  que alguien lo olvide en un método nuevo. Centralizar el "nunca lanza" dentro de la
  única implementación de `EventBus` lo hace imposible de omitir por accidente.
- **Publicar el evento antes del commit** (para "adelantar" la difusión y bajar
  latencia percibida): se descarta — anunciar un cambio que la transacción todavía
  podría revertir (por ejemplo, si el `commit` falla) dejaría a un consumidor futuro
  reaccionando a algo falso. El orden commit-primero es no negociable dado que Postgres
  es la única fuente de verdad (ADR-002).
- **Emitir `OfertaAccepted` únicamente, sin `OfertaPlaced` ni `OfertaWinnerChanged`
  como eventos separados** (ya que técnicamente se derivan de la misma operación): se
  descarta porque el enunciado los pidió como eventos distintos y cada uno sirve a un
  consumidor futuro distinto — `OfertaPlaced` es una señal de auditoría/observabilidad
  agnóstica al resultado (útil para métricas de "cuántos intentos de oferta hay"),
  mientras que `OfertaWinnerChanged` es la señal específica que el módulo de tiempo real
  va a necesitar para notificarle "fuiste superado" al comprador anterior, distinta de
  "tu oferta fue aceptada" para el nuevo líder.

## Consecuencias

- **Ventajas**: el dominio queda completamente desacoplado de sus consumidores (hoy
  ninguno, mañana WebSockets); agregar un evento nuevo en el futuro es agregar una
  clase y una llamada a `publish`, sin tocar el Event Bus ni la infraestructura de
  Redis; los eventos ya tienen la forma exacta (canal por remate, JSON tipado con
  discriminador) que el próximo módulo va a necesitar.
- **Desventajas aceptadas**: cada transición relevante del dominio ahora hace, como
  mínimo, una llamada adicional (aunque de mejor esfuerzo y sin bloquear) — se acepta
  porque el costo es una escritura a un socket Redis ya establecido, no una
  transacción nueva. Sin consumidores todavía, no hay forma de verificar en producción
  que el *contenido* de cada evento es exactamente lo que un consumidor futuro va a
  necesitar — se acepta el riesgo de tener que ajustar payloads cuando el módulo de
  WebSockets los empiece a usar de verdad; el costo de ese ajuste es bajo porque son
  clases Pydantic aisladas, no un contrato ya consumido por nadie.
- Cuando el módulo de tiempo real exista, su trabajo es agregar un suscriptor nuevo
  (handler de WebSocket) al canal `events.<remate_id>` — no debería requerir ningún
  cambio en `app/events/` ni en los `service.py`/`engine.py` ya modificados acá.
