# ADR-025: Sincronización de eventos en tiempo real — Event Consumer como único puente entre dominio y Gateway

- **Fecha**: 2026-07-20
- **Estado**: Aceptada

## Contexto

[ADR-022](ADR-022-arquitectura-de-eventos.md) (Módulo 3.2) dejó al dominio publicando
eventos tipados en `events.<remate_id>` sin que nadie los consuma todavía.
[ADR-023](ADR-023-gateway-websocket.md) (Módulo 3.3) y [ADR-024](ADR-024-sistema-de-salas.md)
(Módulo 3.4) dejaron el Gateway administrando conexiones y agrupándolas por remate, sin
saber nada de eventos de dominio. Falta el componente que efectivamente una las dos
puntas: algo tiene que escuchar Redis Pub/Sub, decidir a qué sala pertenece cada evento,
y entregarlo a esas conexiones — sin que el Auction Engine se entere de que existen
WebSockets, y sin que el Gateway se entere de que existen ofertas.

Esta fase llega además con una restricción operativa explícita: **no modificar**
`app/modules/ofertas/` (Auction Engine), `app/websocket/` (Gateway y `RoomManager`),
`app/modules/auth/` ni la forma del `EventBus` (`app/events/bus.py`,
`app/events/redis_bus.py`). El componente nuevo tiene que apoyarse en la superficie
pública que esos módulos *ya* exponen, sin que ninguno de ellos necesite cambiar una
línea para que esto funcione.

## Decisión

### A. `app/realtime/` — un paquete nuevo, el único que conoce ambos mundos

`EventConsumer` (arranca/detiene la suscripción), `EventDispatcher` (interpreta y
entrega) y `registry.py` (whitelist de eventos sincronizables) viven en un paquete
transversal nuevo, al mismo nivel que `app/redis/`, `app/events/` y `app/websocket/`.
Es, a propósito, el único lugar del sistema que importa tanto clases de evento de
dominio (`app.modules.remates.events`, `.../lotes/events`, `app.modules.ofertas.events`)
como los managers del Gateway (`ConnectionManager`, `RoomManager`) — la dependencia va
siempre en un solo sentido, `app/realtime/` hacia los otros dos, nunca al revés. Un test
de arquitectura (`tests/test_architecture_boundaries.py`) verifica estáticamente, por
import, que ni `app/websocket/` ni `app/modules/ofertas/`/`app/modules/remates/`
importan nada de `app/realtime/`.

### B. Un único suscriptor de patrón (`events.*`), no uno por sala

`EventConsumer` usa el cliente Redis compartido (`app.state.redis`, Módulo 3.1)
directamente — `pubsub.psubscribe("events.*")` — en vez de una suscripción por
`remate_id` que se abre/cierra a medida que las salas se crean/destruyen. Con un único
suscriptor de proceso, el `EventDispatcher` recibe *todos* los eventos de *todos* los
remates y decide, evento por evento, si hay alguien escuchando
(`RoomManager.connections_in_room(remate_id)`); si no hay nadie, el costo es descartar
un mensaje ya recibido — comparado contra el costo/complejidad de mantener N
suscripciones vivas sincronizadas con el ciclo de vida de las salas (que además
requeriría que `RoomManager` notificara al consumer de creaciones/bajas, acoplándolos),
la suscripción única es más simple y no le pide nada nuevo a `RoomManager`.

No se usa `RedisPubSub.subscribe` (`app/redis/pubsub.py`, Módulo 3.1) porque esa clase
solo sabe suscribirse a canales exactos, no a patrones — se usa el cliente Redis crudo
(`redis.asyncio.Redis.pubsub()`, ya expuesto por el mismo objeto compartido) para poder
llamar `psubscribe`. No es una reestructuración de `app/redis/`: ningún archivo de ese
paquete se modifica, es una lectura adicional de la misma conexión ya compartida.

### C. Procesamiento estrictamente secuencial — la razón por la que no hace falta tocar el Gateway para evitar corrupción de escritura

`EventConsumer` recorre `pubsub.listen()` con un único `async for`, y espera
(`await`) cada `dispatcher.dispatch(...)` antes de pasar al mensaje siguiente. Nunca hay
dos entregas del Event Consumer en simultáneo, ni siquiera para remates distintos. Esto
importa porque el heartbeat del Gateway (`router.py`, sin modificar) también puede
escribir en el mismo `WebSocket` (un `ping` periódico) — dos escritores concurrentes
sobre el mismo socket sin coordinación es, en general, un riesgo real (la librería
`websockets`, que usa uvicorn por debajo, documenta explícitamente que `send()` no es
seguro para llamadas concurrentes sin serializar).

Se investigó el código fuente de las versiones exactas que usa este proyecto
(`starlette==0.46.2`, `websockets==16.1`, servidas por `uvicorn==0.32.1`): el método
`WebSocketCommonProtocol.write_frame` de `websockets` arma el frame completo y lo
escribe al transporte en un único tramo **sin ningún `await` de por medio**
(`write_frame_sync`, seguido recién después por `drain()`); como asyncio no hace
preemption dentro de un tramo de código sin `await`, dos llamadas concurrentes a
`send()` no pueden interlear bytes de un mismo frame — en el peor caso, el *orden* de
entrega entre el `ping` del heartbeat y un `domain_event` del consumer queda
indeterminado, nunca los bytes de uno mezclados con los del otro. Ese margen de
indeterminismo de orden es aceptable (ninguno de los dos mensajes depende de llegar
antes o después del otro). Se verificó empíricamente contra el stack real en
`tests/test_realtime_sync.py` (heartbeat y eventos de dominio conviviendo en la misma
conexión) sin observar mensajes corruptos.

Esto es lo que permite cumplir "no modificar el Gateway WebSocket" sin dejar un riesgo
de corrupción de datos sin resolver: no hace falta agregar un lock por conexión en
`manager.py` porque (1) el propio Event Consumer nunca envía dos mensajes en paralelo
consigo mismo, y (2) la única otra fuente de escritura (el heartbeat) es segura a nivel
de frame contra el stack real del proyecto.

### D. Whitelist explícita de eventos sincronizables, no "reenviar todo lo publicado en el canal"

`app/realtime/registry.py` mapea `event_type -> clase Pydantic concreta` para los 12
eventos que este módulo sincroniza (los 10 pedidos por la épica más `RemateCancelled` y
`LoteCancelled`, que aportan el mismo valor de "avisar un cambio de estado visible" que
los demás). Un evento publicado en el canal cuyo `event_type` no está en el registro se
descarta silenciosamente (con un log en nivel `debug`), no se reenvía "por las dudas".
Esto es lo que le da sentido literal al pedido de "interpretar el tipo de evento": el
`EventDispatcher` revalida el JSON crudo contra el schema Pydantic exacto de la clase
registrada antes de reenviarlo — nunca reenvía un `dict` sin tipar.

`RemateCreated` y `RemateScheduled` quedan deliberadamente afuera del registro (ver
docstring de `registry.py`): son transiciones de "antes de que el remate esté en vivo",
sin un caso de uso claro para un cliente que ya está conectado a una sala en tiempo
real. Agregarlos después es una línea nueva en `SYNCED_EVENTS`, no un cambio de diseño.

### E. El envelope de salida (`DomainEventMessage`) extiende `WSMessage` sin tocar `app/websocket/messages.py`

`app/realtime/messages.py` define `DomainEventMessage(WSMessage)` — mismo
`schema_version`/`type` discriminador que el resto del protocolo del Gateway (Módulo
3.3), para que un cliente no tenga que distinguir "mensajes de conexión" de "mensajes de
dominio" por ningún criterio especial. Es un archivo **nuevo**, en `app/realtime/`, que
importa `WSMessage` de `app/websocket/messages.py` sin modificarlo — el Gateway no gana
ningún conocimiento nuevo sobre qué es un evento de dominio.

### F. Reconexión con backoff exponencial y reseteo tras una suscripción exitosa

`EventConsumer._run` atrapa cualquier excepción de `_listen_once` (falla al
`psubscribe`, la conexión se cae en medio del `listen()`) y reintenta con backoff
exponencial (`REALTIME_CONSUMER_RETRY_BASE_SECONDS` a
`REALTIME_CONSUMER_RETRY_MAX_SECONDS`, ambas configurables). El contador de intentos se
resetea a cero apenas un `psubscribe` vuelve a tener éxito — una caída aislada meses
después de un arranque estable no hereda un backoff ya escalado al máximo. Un error al
procesar un mensaje puntual (`dispatcher.dispatch` lanzando, aunque su contrato dice que
no debería) se atrapa por separado, dentro del mismo `async for`, y no cuenta como una
caída de conexión — no dispara reconexión ni backoff, solo se loguea y se sigue con el
próximo mensaje.

### G. `EventDispatcher` nunca lanza, ni deja que una entrega fallida bloquee a las demás

Igual disciplina que `RedisEventBus.publish` (ADR-022, sección D): cualquier fallo
(JSON inválido, tipo no registrado, payload que no matchea el schema, un
`connection_id` que ya no está en `ConnectionManager`, un `send_text` que lanza porque
el socket ya se cerró) se atrapa, se loguea, y el flujo continúa — con las demás
conexiones de la misma sala si la falla fue de una sola entrega, o con el próximo
mensaje del canal si la falla fue de interpretación del evento.

## Alternativas consideradas

- **Suscripción por sala** (`RedisPubSub.subscribe(f"events.{remate_id}")` cuando una
  sala se crea, `unsubscribe` cuando se vacía): más "quirúrgico" en cuánto tráfico
  cruza la conexión de Pub/Sub, pero acopla el ciclo de vida del consumer al de
  `RoomManager` (que hoy no notifica nada — agregar eso violaría "no modificar el Room
  Manager") y multiplica la cantidad de conexiones Redis activas por cada sala
  simultánea. Se descarta a favor de un único suscriptor de patrón — a esta escala, el
  costo de recibir eventos para remates sin conexiones (un `dict.get` + return) es
  insignificante comparado con la complejidad evitada.
- **`asyncio.gather` para despachar a todas las conexiones de una sala en paralelo**: más
  rápido cuando una sala tiene muchas conexiones, pero reintroduce el riesgo de múltiples
  `send_text` concurrentes hacia el *mismo* `ConnectionManager`/proceso simultáneamente
  desde el propio dispatcher (distinto del análisis de la sección C, que cubre
  consumer-vs-heartbeat, no consumer-vs-sí-mismo). Se prefiere entrega secuencial dentro
  de cada `dispatch()` — más simple de razonar y, para el volumen esperado de una sala de
  remate, no es un cuello de botella real. Documentado como optimización futura si hiciera
  falta.
- **El Gateway reenvía los mensajes él mismo, en vez de que el Event Consumer escriba
  directamente en el `WebSocket`**: implicaría agregar una cola de salida por conexión
  y un `await` extra en el bucle de `router.py` para drenarla — exactamente el tipo de
  cambio a `app/websocket/` que esta épica prohíbe. Se descarta.
- **Reenviar todo lo publicado en el canal, sin whitelist** (cualquier `event_type` que
  llegue se reenvía tal cual): más simple, pero le quita al equipo la oportunidad de
  decidir explícitamente qué expone el sistema a un cliente — un evento agregado a
  futuro para auditoría interna terminaría, por accidente, visible en el navegador de
  cualquier usuario conectado. Se descarta a favor de la whitelist de la sección D.
- **Codificar `remate_id` a partir del nombre del canal** (`events.<remate_id>`) en vez
  de leerlo del campo `remate_id` del evento: ambos valores son siempre iguales (es
  literalmente cómo se construye el canal, ver `RemateScopedEvent.topic`), pero leerlo
  del propio evento evita que el dispatcher tenga que parsear el nombre del canal
  (`message["channel"]`) y depender de su formato exacto — un cambio de convención de
  nombres de canal en el futuro no rompería al dispatcher.

## Consecuencias

- **Ventajas**: el Auction Engine y el resto del dominio no ganaron ningún import ni
  dependencia nueva (verificable: la suite de los Módulos 2.1-2.4 sigue pasando sin
  modificaciones, igual que documentó ADR-022); el Gateway y `RoomManager` tampoco — cero
  líneas tocadas en `app/websocket/`; agregar un evento nuevo al catálogo sincronizado es
  una línea en `registry.py`, no un cambio de arquitectura; la reconexión automática hace
  que un restart de Redis en producción se recupere solo, sin reiniciar el proceso del
  backend.
- **Desventajas aceptadas**: el consumer recibe (y descarta) eventos de remates sin
  conexiones activas — tráfico de Redis Pub/Sub que no se aprovecha, aceptado por
  simplicidad (sección B); el despacho secuencial dentro de una sala muy concurrida
  podría, en el límite, introducir latencia perceptible para las últimas conexiones de
  esa entrega — no medido todavía porque el volumen actual no lo justifica; sin
  persistencia de eventos (característica ya aceptada de Pub/Sub desde ADR-009), una
  conexión que se cae y reconecta pierde los eventos ocurridos durante la desconexión —
  exactamente el problema que el snapshot al reconectar (RF-16, ADR-008, todavía sin
  implementar) está pensado para resolver, no este módulo.
- Cuando Chat, Notificaciones o Presencia Online se implementen, cada uno agrega su
  propio consumidor/dispatcher (o extiende el registro de eventos sincronizados) sin
  tocar el Auction Engine — ver la sección correspondiente de
  [22-sincronizacion-tiempo-real.md](../22-sincronizacion-tiempo-real.md) para el detalle
  de por qué esta arquitectura ya los deja preparados.
