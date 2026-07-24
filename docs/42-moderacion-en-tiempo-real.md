# 42 — Moderación y Administración en Tiempo Real (Épica 7, Módulo 7.6)

Este documento es la referencia de diseño del Moderation Service: cómo expulsa/silencia
compradores y bloquea el chat sin tocar el Chat Service ni el Auction Engine, cómo
detecta intentos reiterados de ofertas inválidas, y el panel de moderación del
rematador. Ver [ADR-045](adr/ADR-045-moderacion-en-tiempo-real.md) para el razonamiento
completo de las decisiones tomadas acá.

## Alcance de este módulo

- **Chat**: expulsar y silenciar temporalmente a un comprador puntual; bloquear el
  envío de mensajes para toda la sala por un tiempo configurable ("modo lento");
  destacar/quitar destacado a un mensaje (anuncios del rematador). Eliminar mensajes ya
  existía (Épica 6.4, `ChatService.delete_message`) y se reutiliza sin cambios.
- **Compradores**: expulsar de la sala e impedir el reingreso mientras el remate siga
  activo (una única acción, "expulsar" = ban + corte de conexión); ver compradores
  conectados; buscar por nombre.
- **Ofertas**: detectar intentos reiterados de ofertas inválidas de un mismo comprador,
  registrar cada intento en Auditoría, notificar al rematador al superar un umbral
  configurable.
- **Panel de moderación**: compradores conectados con su estado (silenciado o no) y
  acciones rápidas, historial reciente de acciones de moderación.
- **Notificaciones en tiempo real** cuando: se expulsa un usuario, se silencia un
  usuario, se elimina un mensaje (ya existente), se publica un anuncio destacado.

**No se implementa**: un "motor de reglas" de moderación genérico (ver sección de
arquitectura); desbanear/quitar el silenciamiento antes de que expire (el ban es
definitivo mientras el remate siga activo -- no pedido por el enunciado; el
silenciamiento vence solo por TTL).

## Dónde vive el código

`app/moderation/` -- paquete transversal nuevo, top-level, hermano de
`app/modules/chat/` y `app/modules/ofertas/` (no vive dentro de ninguno de los dos).

| Archivo | Responsabilidad |
|---|---|
| `models.py` | `RemateBan` (persistido -- impide el reingreso), `ModerationPinnedMessage` (persistido -- qué mensaje está destacado). |
| `redis_state.py` | `ModerationRedisGateway` -- estado efímero: silenciar, bloquear-chat, contador de intentos inválidos. |
| `repository.py` | `ModerationRepository` -- Postgres: bans, mensajes destacados, resolución de nombres. |
| `events.py` | 6 eventos de dominio nuevos (`moderacion.*`). |
| `schemas.py` | DTOs + `ERROR_BANNED_FROM_ROOM` (constante del protocolo de salas). |
| `service.py` | `ModerationService` -- toda la lógica de negocio. |
| `realtime.py` | `ModerationEventDispatcher` -- cuarto `EventConsumer`, reacciona a `oferta.rejected`. |
| `dependencies.py`, `router.py` | Providers HTTP/WebSocket y endpoints `/remates/{id}/moderation/...`. |

**Archivos existentes tocados**, todos additivos:

- `app/websocket/router.py`: tercera excepción documentada (las otras dos ya son
  `SnapshotService`/`PresenceService`) -- chequeo de ban antes de `presence_service.
  join_room` en `_handle_join_room`.
- `app/websocket/close_codes.py`: `KICKED = 4403`.
- `app/modules/chat/router.py`: una dependencia (`ModerationRedisGateway`) + chequeo de
  mute/lock antes de `ChatService.send_message` -- **`ChatService` no se modifica**.
- `app/modules/chat/realtime.py`: dos entradas nuevas en el whitelist ya existente
  `SYSTEM_MESSAGE_BUILDERS` (`moderacion.usuario_expulsado`/`usuario_silenciado`).
- `app/audit/actions.py`: 7 constantes nuevas bajo namespace `moderacion.*`.
- `app/audit/repository.py`: `list_paginated` gana `actions: list[str] | None`
  (además del `action` exacto existente), backward-compatible.
- `app/core/config.py`: `MODERATION_INVALID_BID_THRESHOLD` (5),
  `MODERATION_INVALID_BID_WINDOW_SECONDS` (300).
- `app/main.py`: cuarto `EventConsumer` + `ModerationEventDispatcher`.
- `app/realtime/registry.py`: los 6 eventos nuevos a `SYNCED_EVENTS`.
- `app/api/router.py`, `app/db/base.py`: registro del router y los modelos nuevos.
- `tests/test_architecture_boundaries.py`: tests nuevos de desacoplamiento.

**Cero cambios en**: `ChatService`, `ChatMessage` (modelo), `AuctionEngine`, `Oferta`
(modelo), `RoomManager`, `ConnectionManager`, `PresenceService`.

## El flujo de moderación

### Expulsar a un comprador (kick + ban)

`POST /remates/{id}/moderation/expulsar` (`ModerationService.kick_user`):
1. Inserta una fila en `remate_bans` (si no existía ya) -- esto es lo que cumple
   "impedir el reingreso mientras el remate permanezca activo": el Gateway WebSocket
   consulta esta tabla en cada intento de `join_room`.
2. Para cada conexión activa de ese usuario en esa sala puntual
   (`ConnectionManager.connections_for_user` + `RoomManager.room_id_for_connection`),
   cierra el socket con el código `KICKED` (4403).
3. Deja constancia en Auditoría y publica `ModerationUserKicked` (llega en vivo a quien
   siga conectado a la sala, y genera un mensaje de sistema en el chat).

El cleanup de sala/presencia (`RoomManager.leave` + `PresenceUserDisconnected`) **no se
duplica**: cerrar el socket desde afuera dispara `WebSocketDisconnect` en el propio
bucle de esa conexión, que ya tiene su `finally` con ese cleanup -- el mismo camino que
cualquier desconexión normal.

### Silenciar a un comprador / bloquear el chat completo

Dos acciones distintas y complementarias:
- **Silenciar** (`POST .../silenciar`, `{user_id, duration_seconds}`): un comprador
  puntual no puede enviar mensajes por `duration_seconds` (tope 1 hora).
- **Bloquear chat** (`POST .../bloquear-chat`, `{duration_seconds}`): **nadie** puede
  enviar mensajes en esa sala por ese tiempo -- un "modo lento" para calmar un chat
  caldeado.

Ambas son flags con TTL en Redis (`ModerationRedisGateway`), chequeadas en
`chat/router.py::send_chat_message` **antes** de llamar a `ChatService.send_message`.

### Destacar/quitar destacado un mensaje

`POST`/`DELETE /remates/{id}/moderation/mensajes/{message_id}/destacar` -- inserta/borra
una fila en `moderation_pinned_messages` (no toca `chat_messages`). El frontend combina
la lista de mensajes destacados con los mensajes ya cargados en memoria del chat para
resaltarlos visualmente (ícono de pin, fondo distinto).

### Detección de ofertas inválidas repetidas

`AuctionEngine.place_bid` ya publica `oferta.rejected` por cada intento de oferta
inválida (soft-rejection, ADR-018/020) -- **sin ningún cambio en `app/modules/ofertas/`**,
el `ModerationEventDispatcher` (cuarto `EventConsumer`) reacciona a ese evento:
1. Registra un intento en Auditoría (`moderacion.intento_oferta_invalida`) por cada
   evento recibido, con el comprador como actor.
2. Incrementa un contador en Redis por `(remate_id, buyer_id)`, ventana configurable
   (`MODERATION_INVALID_BID_WINDOW_SECONDS`, 5 min por defecto).
3. Al alcanzar el umbral (`MODERATION_INVALID_BID_THRESHOLD`, 5 por defecto) **una única
   vez por ventana**, audita el cruce del umbral, crea una `Notification` persistida
   para el rematador dueño del remate (Notification Service, Épica 7.5), y publica
   `ModerationInvalidBidThresholdExceeded`.

Esta última señal **nunca** se anuncia en el chat público -- ver "Limitaciones/
decisiones de privacidad" más abajo.

## Arquitectura

Ver ADR-045 para el detalle completo. Resumen de las decisiones centrales:

- **Ubicación**: `app/moderation/`, top-level, mismo criterio que `app/postauction/`/
  `app/audit/` -- nunca importado por `app/modules/chat/` ni `app/modules/ofertas/` en
  el sentido inverso (verificado por tests de arquitectura).
- **Enganche con Ofertas**: exclusivamente vía evento (`oferta.rejected`), con el propio
  `EventConsumer` del módulo -- cero import nuevo en `app/modules/ofertas/`.
- **Enganche con Chat**: dos líneas additivas en `chat/router.py` (nunca en
  `ChatService`), usando la superficie liviana `ModerationRedisGateway` -- nunca el
  `ModerationService` completo (que compone mucho más: `ConnectionManager`/
  `RoomManager`/`RemateService`/etc.).
- **Enganche con el Gateway WebSocket**: `ModerationService` completo, como tercera
  excepción documentada junto a `SnapshotService`/`PresenceService` -- consistente con
  que esas dos ya son las únicas excepciones aceptadas al "cero conocimiento de
  dominio" del Gateway.
- **"Historial reciente"**: reutiliza el Audit Service (Épica 7.2) en vez de una tabla
  propia -- `AuditLogRepository.list_paginated` gana un filtro por lista de acciones.

## Control de acceso

- Escritura (expulsar, silenciar, bloquear-chat, destacar/quitar destacado):
  exclusivamente el dueño del remate -- sin excepción para admin, mismo criterio
  restrictivo que `ChatService.delete_message` ya aplica a la moderación de chat.
- Lectura (conectados, historial): dueño o admin (criterio de Audit/History).
- Mensajes destacados (`GET .../destacados`): cualquiera que pueda ver el remate --ya
  son visibles dentro del propio chat, no es información sensible.

## Interfaz -- frontend

`features/moderation/`, mismo layout que `features/postauction/`:

| Archivo | Qué hace |
|---|---|
| `types.ts`, `api.ts` | DTOs y llamadas HTTP. |
| `hooks.ts` | `useConnectedBuyers` (con búsqueda), `usePinnedMessages`, `useModerationHistory` -- fetch simple, sin reconciliación incremental. |
| `realtime/events.ts` | Type guards de los 6 eventos de moderación sobre el `WebSocketClient` ya compartido. |
| `components/ModerationPanel.tsx` | Composición principal -- conectados + bloqueo de chat + historial, se suscribe una vez a `subscribeToRealtime` y refresca ante cualquier evento relevante. |
| `components/ConnectedBuyersList.tsx` | Buscador + fila por comprador (estado, acciones rápidas). |
| `components/KickModal.tsx`, `MuteModal.tsx`, `LockChatButton.tsx` | Formularios de las tres acciones. |
| `components/RecentModerationActions.tsx` | Historial, mismo criterio visual que `AuditLogTimeline`. |

Integración con Chat (solo UI, cero cambios de backend de Chat): `ChatMessageItem.tsx`
gana un botón "destacar" junto al de eliminar ya existente; `ChatPanel.tsx` resuelve los
mensajes destacados con `usePinnedMessages` y los combina con los mensajes ya cargados.

`ConsolaOperativaPage.tsx` agrega `ModerationPanel` como sección nueva, junto a
`ChatPanel`/`AnalyticsPanel` -- mismo patrón (`remateId` + `subscribeToRealtime`, sin
tocar `useLiveRemateState`).

## Limitaciones conocidas y decisiones de privacidad (documentadas, no huecos)

- **El umbral de ofertas inválidas nunca se anuncia en el chat público** -- solo genera
  una notificación privada al rematador. Publicarlo expondría el historial de intentos
  fallidos de un comprador puntual a todos los conectados.
- **Sin "desbanear" ni cancelar un silenciamiento antes de tiempo** -- el ban dura
  mientras el remate esté activo (no pedido); el silenciamiento vence solo por TTL.
- **El bloqueo de chat es de sala completa** -- confirmado explícitamente como
  distinto y complementario al silenciamiento individual, no una repetición del mismo
  concepto.
- **Preparado para nuevas reglas, sin motor de reglas genérico**: cada acción es un
  método independiente y componible de `ModerationService`; los umbrales/duraciones son
  `Settings`; el `EventConsumer` sigue el mismo patrón whitelist-extensible que el resto
  del proyecto -- una regla nueva se arma componiendo los métodos existentes, sin
  rediseñar nada.

## Checklist del módulo

- [x] Chat: eliminar (ya existía), silenciar, bloquear-chat, destacar/quitar destacado.
- [x] Compradores: expulsar + impedir reingreso, ver conectados, buscar por nombre.
- [x] Ofertas: detectar intentos inválidos repetidos, registrar en Auditoría, notificar
      al rematador al superar el umbral.
- [x] Panel de moderación: conectados, estado, acciones rápidas, historial reciente.
- [x] Notificaciones en tiempo real: expulsión, silenciamiento, mensaje eliminado
      (ya existente), anuncio destacado.
- [x] Moderation Service desacoplado de Chat Service y Auction Engine (verificado por
      tests de arquitectura).
- [x] Preparado para nuevas reglas de moderación, documentado.
- [x] Tests: `test_moderation_repository.py`, `test_moderation_redis_state.py`,
      `test_moderation_service.py`, `test_moderation_router.py`,
      `test_moderation_realtime.py`, `test_moderation_websocket_ban.py`; tests nuevos
      en `test_architecture_boundaries.py`; frontend: `hooks.test.ts` + tests de
      componentes de `features/moderation/`, y casos nuevos en
      `ChatMessageItem.test.tsx`/`ChatPanel.test.tsx`.
- [x] Documentación (este archivo) y ADR (ADR-045) actualizados.
