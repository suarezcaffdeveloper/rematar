# ADR-037: Chat del Remate — módulo de dominio propio, segundo `EventConsumer` idempotente, keyset sobre offset

- **Fecha**: 2026-08-01
- **Estado**: Aceptada

## Contexto

Desde el Módulo 3.5, `docs/22-sincronizacion-tiempo-real.md` anticipa explícitamente
cómo se agregaría un chat, en su sección "Cómo esta arquitectura permitirá agregar
Chat, Notificaciones y Presencia Online":

> "Chat: se modela como un evento más (`ChatMessageSent`) publicado por un futuro
> módulo de dominio `chat`, sincronizado agregando su clase a `registry.py` — el mismo
> mecanismo que ya usa cualquier evento de dominio existente."

Este módulo (Épica 6, Módulo 6.4) implementa exactamente eso, apoyado en el Presence
Service (Módulo 6.2, ADR-036) para "conectados al chat" y en toda la infraestructura de
tiempo real de la Épica 3, sin modificarla en su lógica interna. Este ADR registra las
decisiones de diseño propias del chat que no estaban ya cubiertas por ADR-025 (Módulo
3.5) o ADR-036 (Módulo 6.2).

## Decisión

### A. Módulo de dominio propio (`app/modules/chat/`), no infraestructura transversal

A diferencia de `app/presence/`/`app/snapshot/` (paquetes transversales, sin modelo de
base de datos, que orquestan infraestructura ya construida), el Chat persiste datos de
negocio reales con reglas propias (longitud, moderación, rate limiting) — mismo perfil
que `Oferta` (`app/modules/ofertas/`). Se modela como `app/modules/chat/`, con la misma
estructura interna (`models.py`/`schemas.py`/`repository.py`/`service.py`/`router.py`)
que cualquier otro módulo de dominio del proyecto.

### B. Escritura por HTTP, broadcast por el pipeline de eventos ya existente

Envío, borrado y "está escribiendo" van por HTTP — el Gateway WebSocket
(`app/websocket/router.py`) no gana ningún tipo de mensaje nuevo. Mismo criterio que
`AuctionEngine.place_bid` (la escritura es HTTP, el broadcast en vivo llega por los
eventos de dominio que el backend ya reenvía). Hoy el Gateway ya tiene dos excepciones
deliberadas a "no conoce dominio" (Snapshot, Módulo 3.6; Presencia, Módulo 6.2, que
además necesita conocer la membresía de sala) — abrir una tercera para chat habría
significado enseñarle a interpretar un tipo de mensaje nuevo (`chat_message`) sin
ningún beneficio sobre reusar el `EventConsumer`/`EventDispatcher` que cualquier
mensaje de dominio ya atraviesa.

### C. `EventConsumer.dispatcher` generalizado a un `Protocol` estructural

Para poder tener un segundo `EventConsumer` con un dispatcher distinto (ver sección D),
`app/realtime/consumer.py::EventConsumer.__init__` cambia el tipo de su parámetro
`dispatcher` de la clase concreta `EventDispatcher` a un `Protocol` nuevo (`Dispatcher`,
un único método `async def dispatch(self, raw_payload: str | bytes) -> None`). **Cero
cambio de comportamiento**: `tests/test_realtime_consumer.py` ya pasaba un
`_RecordingDispatcher` que no hereda de `EventDispatcher`, solo implementa `dispatch`
— funcionaba por duck typing desde antes de este módulo, el `Protocol` solo lo hace
explícito en el sistema de tipos.

### D. Mensajes de sistema — segundo `EventConsumer` independiente, no un hook en el dominio

`ChatSystemEventDispatcher` (`app/modules/chat/realtime.py`) es un **segundo**
suscriptor a `events.*`, arrancado junto al `EventConsumer` principal en el lifespan de
`app/main.py`. Ya anticipado textualmente en ADR-025, sección "Consecuencias": "cada uno
[Chat/Notificaciones/Presencia] agrega su propio consumidor/dispatcher... sin tocar el
Auction Engine". La alternativa — publicar un `ChatMessageSent` directamente desde
`RemateService.pause()`/`LoteService.close()`/etc. — habría acoplado el dominio de
remates a la existencia del chat (`RemateService` tendría que saber que el chat existe
e importar su `ChatService`), exactamente el tipo de acoplamiento que Redis Pub/Sub
como backplane (ADR-009) existe para evitar. Un segundo suscriptor independiente logra
el mismo resultado sin que el dominio publicador sepa que el chat lo está escuchando.

`ChatSystemEventDispatcher.dispatch` reconoce una whitelist explícita de 6
`event_type` (`SYSTEM_MESSAGE_BUILDERS`, mismo criterio que `EVENT_REGISTRY` en
`app/realtime/registry.py`: un evento de dominio nuevo no genera mensaje de sistema
hasta que alguien lo agregue a propósito) y arma el texto usando únicamente campos que
el evento ya trae en su payload — ninguna consulta extra a la base. Nunca reacciona a
sus propios eventos `chat.*` (ausentes de la whitelist), lo cual evita un loop sin
necesitar lógica condicional adicional.

### E. Idempotencia vía `source_event_id` + índice único parcial

En un despliegue multi-instancia (el diseño de Redis Pub/Sub como backplane ya asume
esto, ADR-009), cada instancia del backend tendría su propio
`ChatSystemEventDispatcher` reaccionando al mismo `PUBLISH`, generando N filas
duplicadas del mismo mensaje de sistema si no se protege. Se resuelve con
`ChatMessage.source_event_id` (el `event_id` del evento de dominio que originó el
mensaje, ya existe en `DomainEvent` desde Fase 0) + un índice único parcial
(`uq_chat_messages_source_event_id`, `WHERE source_event_id IS NOT NULL`) — mismo
patrón que `uq_ofertas_buyer_id_client_token` en `Oferta`. `ChatService.record_system_
message` chequea primero por `get_by_source_event_id` (camino feliz, sin condición de
carrera); si de todas formas dos instancias corren la carrera, la segunda recibe
`IntegrityError`, hace `rollback()` y relee la fila ya persistida por la primera, sin
publicar un segundo `ChatMessageSent`.

**Distinción deliberada entre una condición de carrera esperada y una anomalía
genuina**: si tras el `IntegrityError` la fila *sigue* sin aparecer (por ejemplo,
`remate_id` no corresponde a ningún remate real — el índice único no es la única razón
posible de un `IntegrityError`), se loguea con `logger.warning(...)` en vez de fallar
en silencio, pero de todas formas no se relanza — mismo contrato "nunca lanza" que el
resto del pipeline de eventos (`EventBus.publish`, ADR-022).

**Limitación aceptada** (mismo tono que ADR-009): una desconexión de Redis justo en la
ventana de un evento de ciclo de vida puede perder ese mensaje de sistema puntual, sin
mecanismo de recuperación — a diferencia del estado real del remate (que se
autocorrige en cada reconexión vía snapshot), no existe hoy un reintento para mensajes
de sistema perdidos. Se acepta porque el impacto es cosmético (falta un aviso en el
chat, no un dato de negocio) y el caso es infrecuente.

### F. `session_factory` inyectable en `ChatSystemEventDispatcher`, no `AsyncSessionLocal` global

`ChatSystemEventDispatcher` recibe un `session_factory: async_sessionmaker[AsyncSession]`
por constructor en vez de importar el singleton `AsyncSessionLocal`
(`app/db/session.py`) directamente. Es imprescindible, no una preferencia de estilo: un
`async_sessionmaker` está atado al event loop en el que se creó el engine subyacente, y
`pytest-asyncio` crea un event loop **nuevo por test**. Como este dispatcher corre
como tarea de fondo iniciada en el lifespan (no pasa por el sistema de inyección de
dependencias de FastAPI, a diferencia de `get_db`, que sí está sobreescrito por test vía
`app.dependency_overrides`), usar el singleton global desde una tarea de fondo
compartida entre decenas de tests con distintos event loops corrompía el pool de
conexiones ("Event loop is closed", con fallas apareciendo incluso en archivos de test
que no tocan chat en absoluto). `app/main.py` resuelve el factory como
`getattr(app.state, "db_session_factory", None) or AsyncSessionLocal`; `tests/conftest.py`
(fixtures `client`/`ws_client`) y `tests/test_websocket_gateway.py` (`_build_ws_app`)
inyectan un factory test-scoped en `app.state.db_session_factory` antes de entrar al
lifespan — mismo mecanismo, en los hechos, que ya usa `get_db` sobreescrito, ahora
disponible también para tareas de fondo iniciadas en el lifespan. Es el primer caso de
este tipo en el proyecto: no había un precedente previo para una tarea de fondo con
acceso a base de datos, y este patrón (`app.state.db_session_factory`) queda disponible
para cualquier tarea futura equivalente.

### G. Paginación keyset, no offset/limit

`ChatMessageRepository.list_before` compara `(created_at, id) < (:before_created_at,
:before_id)` de forma row-wise, no `OFFSET`/`LIMIT` como
`OfertaRepository.list_by_lote`. Desviación consciente: "miles de mensajes" con scroll
infinito hacia atrás es exactamente el escenario donde `OFFSET` se degrada (cada
página más profunda escanea y descarta más filas que la anterior). La comparación es
row-wise, no solo por `created_at`, porque dos mensajes pueden compartir el mismo
timestamp bajo concurrencia — comparar solo por `created_at` podría saltear o duplicar
filas exactamente en el borde de un timestamp repetido. El cliente manda
`before_created_at`+`before_id` explícitos (los del mensaje más antiguo ya cargado), no
un cursor opaco codificado — coherente con que el resto de la API tampoco usa cursores
opacos en ningún otro listado.

### H. `author_name`/`author_role` denormalizados en `ChatMessage`

Se guardan al momento de enviar el mensaje, no se resuelven por `JOIN` a `users` en
cada lectura. Dos razones, ambas de peso: evita un `JOIN` en la consulta más frecuente
del módulo (listar historial, con paginación), y preserva el nombre/rol que la persona
tenía *en ese momento* — un mensaje viejo no debería cambiar de autor visible si la
persona luego se renombra. `author_role` se guarda como `String(20)` plano, no el ENUM
nativo `user_role` (`app/modules/users/models.py`, ver ADR-010): es un dato de
auditoría histórico, no una referencia viva — acoplarlo al catálogo de roles haría que
un cambio futuro de ese catálogo alterase silenciosamente la semántica de mensajes
viejos, y además evita la complejidad real de compartir un mismo tipo `ENUM` de
Postgres entre dos tablas gestionadas por migraciones independientes.

### I. Moderación sin excepción para admin, soft-delete

`ChatService.delete_message` exige `get_owned_or_raise` (dueño del remate) — sin
excepción para el rol admin, mismo criterio restrictivo que ya aplica el resto de las
acciones de escritura sobre un remate (`docs/14-modulo-remate.md`: "el admin puede ver
todo pero no puede escribir"). Soft-delete vía `SoftDeleteMixin` (ya usado por
`Remate`), no un `DELETE` físico: preserva auditoría y, en el frontend, permite marcar
el mensaje existente como eliminado sin remover la fila de la lista (preserva la
posición de scroll, evita un salto visual). `ChatMessageRead` enmascara `content` a
`null` cuando `is_deleted`, mismo mecanismo de enmascarado que `reserve_price`/
`buyer_id` (ADR-026) — el backend nunca serializa un placeholder de texto, el copy
("Mensaje eliminado") es decisión exclusiva del frontend.

### J. Longitud validada en el servicio, no en el schema Pydantic

El límite de caracteres (`CHAT_MESSAGE_MAX_LENGTH`) se aplica en
`ChatService.send_message`, no como una restricción de `Field` en
`ChatMessageCreate` — mismo patrón ya establecido por `MAX_IMAGE_UPLOAD_BYTES`
(`app/core/config.py`): un límite configurable por `Settings` no puede vivir hardcodeado
en la anotación de tipo de un schema. El schema sí valida (vía `field_validator`) que
el contenido no esté vacío ni sea solo espacios — una regla de forma, no de negocio
configurable.

### K. Rate limiting en el servidor, no delegado únicamente al cliente

`RedisRateLimiter` (`app/redis/rate_limit.py`, nuevo, infraestructura genérica sin
conocimiento de chat — mismo nivel que `RedisCache`/`RedisLockFactory`) protege tanto
el envío de mensajes como el aviso de "está escribiendo", con ventanas y límites
independientes (`CHAT_RATE_LIMIT_*` vs `CHAT_TYPING_RATE_LIMIT_*`). El frontend
(`useChatMessages`) también throttlea del lado del cliente, pero es una optimización de
experiencia (menos tráfico innecesario), no la protección real — un cliente
modificado que ignore el throttle sigue limitado por el rate limit del servidor.
Fixed-window (`INCR`+`EXPIRE`), no ventana deslizante: menos preciso en el borde de dos
ventanas consecutivas, pero atómico por comando único y sin necesitar un script Lua ni
una estructura de datos más compleja — "básico" es lo que pide el enunciado del módulo.

## Alternativas consideradas

- **Publicar `ChatMessageSent` de mensajes de sistema directamente desde
  `RemateService`/`LoteService`**: descartada por acoplar el dominio de remates al
  chat — ver sección D.
- **Extender el Gateway WebSocket para aceptar un tipo de mensaje `chat_message`**:
  descartada por abrir una tercera excepción a "el Gateway no conoce dominio" sin
  necesidad — ver sección B.
- **Cursor opaco codificado (base64 de `created_at`+`id`) en vez de dos parámetros de
  query explícitos**: descartada por inconsistencia con el resto de la API (ningún
  otro listado del proyecto usa cursores opacos) y porque no aporta ningún beneficio
  real sobre pasar los dos campos explícitos.
- **`author_role` como el ENUM nativo `user_role`**: descartada — ver sección H,
  acoplaría datos históricos a un catálogo que puede cambiar.
- **Offset/limit para el historial, igual que `OfertaRepository.list_by_lote`**:
  descartada por degradarse en el escenario específico de scroll infinito hacia atrás
  con miles de mensajes — ver sección G.
- **Excepción de admin en `delete_message`**: descartada por inconsistencia con el
  resto de las reglas de escritura del proyecto — ver sección I.

## Consecuencias

- **Ventajas**: el chat se integró sin modificar el Gateway WebSocket, `RoomManager`,
  `ConnectionManager`, `EventDispatcher` ni el dominio de remates/ofertas — la
  arquitectura de eventos de la Épica 3 demostró, en los hechos, poder absorber un
  módulo entero de dominio nuevo con solo: un módulo propio, tres eventos agregados a
  `SYNCED_EVENTS`, y un segundo consumidor. El patrón `app.state.db_session_factory`
  (sección F) queda disponible para cualquier tarea de fondo futura con acceso a base
  de datos.
- **Desventajas aceptadas**: existe ahora un segundo `EventConsumer` corriendo en todo
  momento (aun en remates sin nadie chateando) — costo aceptado por la simplicidad de
  no tener que activarlo/desactivarlo dinámicamente por remate. La pérdida posible de
  un mensaje de sistema puntual en una ventana de desconexión de Redis (sección E) es
  una limitación conocida, no un objetivo de este módulo resolver.
- Cualquier módulo futuro que necesite reaccionar a eventos de ciclo de vida sin
  acoplar el dominio publicador puede seguir el mismo patrón: un `Dispatcher`
  (`Protocol`) propio + un segundo `EventConsumer`, sin reabrir `app/realtime/consumer.py`
  otra vez.
