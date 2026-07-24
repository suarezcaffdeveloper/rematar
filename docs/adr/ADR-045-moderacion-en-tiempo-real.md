# ADR-045: Moderación y Administración en Tiempo Real — Moderation Service desacoplado vía eventos y superficies livianas, ban persistido + estado efímero en Redis, historial reutilizando Auditoría

- **Fecha**: 2026-07-23
- **Estado**: Aceptada

## Contexto

El enunciado pide herramientas de moderación de sala en vivo (expulsar/silenciar
compradores, bloquear el chat, destacar mensajes, detectar ofertas inválidas repetidas)
con la instrucción explícita de crear un **Moderation Service desacoplado**, manteniendo
esa lógica separada del Chat Service y del Auction Engine. Al investigar el código antes
de diseñar esto se confirmó que no existe hoy ningún concepto de ban/kick/mute -- se
construye todo nuevo, pero reutilizando en su totalidad la infraestructura ya existente
(rooms, connection manager, event bus, audit, notifications).

## Decisión

### A. Ubicación top-level (`app/moderation/`), no `app/modules/moderation/`

Mismo criterio que `app/postauction/`/`app/audit/`: un paquete transversal, hermano de
`app/modules/chat/` y `app/modules/ofertas/`, que reacciona a esos dos dominios sin ser
parte de ellos. Verificado con tests de arquitectura nuevos que prohíben a
`app/moderation/` importar la superficie de escritura de Chat (`service`/`router`/
`realtime`) o cualquier cosa de `app.modules.ofertas`, y que prohíben a los módulos de
dominio importar `app.moderation.service`/`router` (solo su superficie liviana de
lectura, ver sección C).

### B. Detección de ofertas inválidas vía evento, nunca llamada directa

`AuctionEngine.place_bid` ya publica `oferta.rejected` en cada intento de oferta
inválida (soft-rejection, ADR-018/020). En vez de que el motor llame a un
`ModerationService` nuevo directamente, este módulo agrega su propio (**cuarto**)
`EventConsumer` con un `ModerationEventDispatcher` que reacciona a ese evento leyendo su
JSON crudo, sin importar la clase `OfertaRejected` -- mismo patrón exacto que
`PostAuctionEventDispatcher`/`ChatSystemEventDispatcher`. `app/modules/ofertas/` no
gana ni un solo import nuevo.

### C. Dos superficies de acoplamiento con Chat/WebSocket, deliberadamente asimétricas

Se necesitaban dos puntos de enganche síncronos (no todo puede resolverse por evento
asíncrono: un mensaje silenciado debe rechazarse en el momento, no después):

- **`chat/router.py` (dominio)**: usa únicamente `ModerationRedisGateway` (una clase
  liviana que solo envuelve el cliente Redis: `is_muted`/`is_chat_locked`) -- **nunca**
  el `ModerationService` completo, que compone `ConnectionManager`/`RoomManager`/
  `RemateService`/`ChatMessageRepository`/`UserRepository`/etc. Mismo criterio "domain
  module importa la superficie mínima que necesita" que ya aplica `app.audit.repository`
  en toda la base de código. `ChatService` en sí **no gana ningún import ni cambio**:
  el chequeo vive enteramente en el router (capa de transporte), como una dependencia
  más antes de delegar en el servicio -- mismo patrón que Observabilidad (Épica 8.1)
  usó para instrumentar el router de ofertas sin tocar `AuctionEngine`.
- **`app/websocket/router.py` (Gateway)**: usa el `ModerationService` **completo**,
  como una **tercera excepción** documentada junto a `SnapshotService` (Módulo 3.6) y
  `PresenceService` (Módulo 6.2) -- el propio archivo ya declaraba "las únicas dos"
  excepciones a su regla de cero conocimiento de dominio; este módulo extiende esa
  misma lista a tres, consistente con el criterio ya establecido, en vez de inventar
  una superficie más liviana solo para este caso.

Ambos casos evitan un ciclo de imports: `app/moderation/service.py` importa
`app.websocket.manager`/`app.websocket.rooms` (módulos hoja, sin importar `app.websocket.
router` de vuelta) y `app.presence.service` (que tampoco conoce moderación) -- así que
`app/websocket/router.py` puede importar el servicio completo de moderación sin crear
un ciclo.

### D. Kick = ban persistido + cierre forzado, sin duplicar el cleanup del Gateway

"Expulsar" es una única acción (`ModerationService.kick_user`) que persiste un ban
(Postgres, `RemateBan` -- debe sobrevivir un restart, a diferencia de silenciar/
bloquear-chat) y cierra cualquier conexión activa de ese usuario en esa sala puntual
(`ConnectionManager.connections_for_user` + `RoomManager.room_id_for_connection`).
Deliberadamente **no** se replica manualmente el cleanup de sala/presencia
(`RoomManager.leave`/`PresenceUserDisconnected`): cerrar el socket desde afuera dispara
`WebSocketDisconnect` en el propio bucle de esa conexión (`_run_connection_loop`), que
ya tiene ese cleanup en su `finally` -- el mismo camino que cualquier desconexión
normal. Duplicar esa lógica en `ModerationService` sería código muerto redundante.

### E. Ban persistido en Postgres; silenciar/bloquear-chat efímeros en Redis

El ban necesita sobrevivir un restart del backend -- si se perdiera, un comprador
expulsado podría reingresar, y "impedir el reingreso mientras el remate permanezca
activo" es un requisito explícito del enunciado. Silenciar y bloquear-chat, en cambio,
son sanciones temporales por diseño (tienen una duración configurable) -- Redis con TTL
(`ModerationRedisGateway`, mismo espíritu que `RedisRateLimiter`) alcanza, y si se
perdiera antes de tiempo el peor caso es que la sanción termine antes, nunca que se
viole la garantía de "no reingreso" que sí exige persistencia real.

### F. Destacar mensajes: tabla propia, cero columnas nuevas en `chat_messages`

Se consideró agregar una columna `is_pinned`/`pinned_at` a `ChatMessage` (bullet listado
bajo "CHAT" en el enunciado, al lado de "eliminar mensajes"). Se descartó: eso acoplaría
el modelo de Chat a un concepto de moderación, exactamente lo que el enunciado pide
evitar. `ModerationPinnedMessage` (tabla propia, FK de solo lectura a `chat_messages.id`
vía `ChatMessageRepository.get_by_id`, ya existente) resuelve lo mismo sin tocar el
modelo de Chat en absoluto.

### G. "Historial reciente de acciones" reutiliza Auditoría, no una tabla nueva

Cada acción de moderación se audita con `AuditLogRepository.record(...)` en la misma
transacción (mismo patrón que `ChatService.delete_message` ya usa). En vez de construir
un almacenamiento de historial propio, `AuditLogRepository.list_paginated` gana un
parámetro nuevo backward-compatible (`actions: list[str] | None`, además del `action:
str | None` exacto ya existente) para poder pedir "todas las acciones de moderación de
este remate" en una sola consulta -- la única modificación a un módulo compartido fuera
de moderación/chat/websocket, y estrictamente additiva (el filtro `action` exacto que ya
usaban Audit/otros módulos sigue funcionando idéntico).

### H. El umbral de ofertas inválidas nunca se publica en el chat

`ModerationInvalidBidThresholdExceeded` se notifica de forma privada al rematador
(Notification Service, Épica 7.5) y se sincroniza en vivo solo para quien ya esté
conectado a esa sala con permisos de dueño/admin -- **nunca** se agrega a
`SYSTEM_MESSAGE_BUILDERS` de Chat. Publicarlo como mensaje de sistema expondría el
historial de intentos fallidos de un comprador puntual a todos los conectados,
una filtración de privacidad sin justificación de negocio.

### I. Sin motor de reglas genérico -- preparado, no construido

No se construye una abstracción de "reglas de moderación" configurable (estrategia,
motor de eventos genérico, etc.) sin un caso de uso concreto hoy -- mismo criterio
"preparado, no construido" que Prometheus/Grafana (ADR-041) o la exportación de reportes
(ADR-040). La preparación real: cada acción es un método independiente de
`ModerationService` (`kick_user`, `mute_user`, `lock_chat`, `pin_message`, ...), los
umbrales/duraciones ya son `Settings` configurables, y el `EventConsumer` sigue el mismo
patrón whitelist-extensible (`_RECOGNIZED_EVENT_TYPES`) que todo el proyecto ya usa. Una
regla nueva ("auto-mute tras N avisos", por ejemplo) se arma componiendo estos métodos
desde uno nuevo, sin rediseñar la arquitectura.

## Alternativas consideradas

- **`ModerationService` completo importado también en `chat/router.py`**: descartada,
  ver sección C -- innecesariamente pesado para un chequeo de dos flags en Redis.
- **Columna `is_pinned` en `ChatMessage`**: descartada, ver sección F -- acopla el
  modelo de Chat a un concepto de moderación.
- **Tabla de historial propia para el panel de moderación**: descartada, ver sección G
  -- Auditoría ya resuelve exactamente lo mismo con una consulta adicional.
- **Publicar el umbral de ofertas inválidas en el chat**: descartada, ver sección H --
  filtración de privacidad.
- **Motor de reglas de moderación genérico**: descartado, ver sección I -- complejidad
  sin caso de uso concreto, contraria al criterio de "no diseñar para requisitos
  hipotéticos" que ya aplica el resto del proyecto.

## Consecuencias

- **Ventajas**: cero cambios en `ChatService`, `ChatMessage`, `AuctionEngine`, `Oferta`,
  `RoomManager`, `ConnectionManager`, `PresenceService`; el desacoplamiento es una
  garantía verificada por test estático, no solo una intención de diseño; el ban
  (la única garantía que debe sobrevivir un restart) vive en Postgres, todo lo demás
  efímero vive en Redis sin sobre-ingeniería.
- **Desventajas aceptadas**: sin "desbanear"/cancelar un silenciamiento antes de tiempo
  (no pedido); sin motor de reglas genérico (esperado, preparado no construido); el
  registro de cada intento de oferta inválida en Auditoría (no solo al cruzar el
  umbral) puede generar volumen bajo un "bid storm" -- aceptado porque el enunciado pide
  explícitamente "registrar esos eventos en Auditoría", no solo el cruce del umbral.
- Agregar una regla de moderación nueva a futuro es: un método nuevo en
  `ModerationService` que compone `kick_user`/`mute_user`/etc. ya existentes, sin
  reabrir la arquitectura de enganche con Chat/Ofertas/WebSocket.
