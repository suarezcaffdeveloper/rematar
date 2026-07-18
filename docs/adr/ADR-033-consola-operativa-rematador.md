# ADR-033: Consola Operativa del Rematador — paneles propios en vez de extender los del comprador, y por qué no refrescar por HTTP después de una acción

- **Fecha**: 2026-07-28
- **Estado**: Aceptada

## Contexto

Épica 5, Módulo 5.2 pide la pantalla de control de un remate en vivo: cabecera con
tiempo transcurrido y conectados, panel principal con el lote activo, panel de control
con seis acciones del motor de estados, panel de ofertas en tiempo real con la última
oferta destacada, y panel de próximos lotes con selección condicionada al estado del
remate. Restricciones explícitas: cero cambios en `backend/`, en la arquitectura del
frontend, y en la experiencia del comprador. El módulo pide explícitamente "aprovechar
la infraestructura WebSocket ya implementada" (Épica 4.6). Dos decisiones de diseño
quedaron por tomar: si los paneles de esta consola debían reusar o extender los
componentes ya construidos para la Sala del comprador (Épica 4.5), y cómo garantizar que
el estado se mantenga sincronizado tras cada acción del panel de control sin violar "no
modificar la experiencia del comprador" ni introducir inconsistencias.

## Decisión

### A. Paneles nuevos en `features/rematador/`, no extensiones de los del comprador

`ActiveLotePanel` (Sala) embebe `PlaceBidButton` -- un botón de "Realizar oferta"
específico del comprador. `OfferHistoryPanel` y `UpcomingLotesStrip` (Sala) son de solo
lectura por diseño explícito ("deliberadamente NO seleccionable", `docs/27-sala-del-
remate.md`). Ninguno de los tres podía reutilizarse tal cual para la consola: el panel
principal de la consola no debe mostrar un botón de oferta (no tiene sentido para el
rematador), el panel de próximos lotes de la consola SÍ necesita ser seleccionable
(pedido explícito de este módulo), y el panel de ofertas de la consola necesita destacar
la última oferta (tampoco pedido para la Sala). Modificar esos tres componentes para
agregar props condicionales (`hideBidButton`, `selectable`, `highlightLatest`) fue
evaluado y descartado: la instrucción de esta fase es no tocar la experiencia del
comprador, y aunque un prop opcional con default retrocompatible technically no cambia
esa experiencia (mismo patrón ya usado en ADR-032 con `DashboardToolbar`), el riesgo de
introducir una regresión visual o de comportamiento en la Sala -- verificada y estable
desde la Épica 4.5/4.6 -- por un cambio que solo beneficia a la consola no se justifica.
Se prefirió construir tres componentes nuevos en `features/rematador/components/`
(`ConsolaLotePanel`, `ConsolaOfferPanel`, `ConsolaUpcomingLotesPanel`), con la misma
identidad visual (mismos tokens de color, mismos badges de `features/remates/labels.ts`)
pero cada uno con exactamente la semántica que este módulo necesita.

Lo que SÍ se reutiliza tal cual, sin ningún cambio ni riesgo, son los componentes
verdaderamente puros de la Sala -- sin ninguna acción ni lógica de comprador embebida:
`ImageGallery` (una galería de imágenes no sabe quién la mira) y
`ConnectionStatusBadge` (un indicador de conexión tampoco). Y, más importante,
`useLiveRemateState` (`features/sala/hooks.ts`) se reutiliza íntegro: es el hook que ya
resuelve snapshot inicial + reconciliación por WebSocket + eventos incrementales, sin
ninguna semántica de comprador -- reimplementarlo para la consola habría sido duplicar,
sin ningún beneficio, la pieza más compleja y ya probada de la Épica 4.6.

### B. Sin refresco HTTP de respaldo después de una acción -- confiar enteramente en el evento de WebSocket

Este módulo se apoya en que la consola ya está unida a la sala del remate por WebSocket
(mismo mecanismo que la Sala del comprador): cada acción del panel de control dispara un
evento de dominio (`lote.opened`, `remate.paused`, etc.) que vuelve por el mismo canal y
actualiza el estado en memoria vía el reducer ya existente (`features/sala/realtime/
reducer.ts`, Épica 4.6, sin tocar). La primera versión de `ConsolaControlPanel` llamaba,
además, a `reload()` (`useRemateSnapshot`, HTTP) después de cada acción exitosa, como
respaldo defensivo para el caso -- infrecuente -- de que la conexión WebSocket estuviera
caída en ese momento puntual.

Verificado en vivo contra el backend real (Docker Compose, no en un test unitario que
mockea el transporte): ese refresco de respaldo introducía un bug real y reproducible.
`SnapshotService` (Épica 3.6, sin cambios) cachea el estado crudo en Redis con
`SNAPSHOT_CACHE_TTL_SECONDS = 2.0` (ver `docs/23-snapshot-service.md`). Un `reload()`
disparado inmediatamente después de, por ejemplo, abrir un lote podía ejecutar su `GET
/remates/{id}/snapshot` dentro de esa ventana de 2 segundos desde un pedido anterior (el
de la carga inicial de la página, o el del propio `join_room`) -- y `SnapshotService`
devolvía la respuesta **cacheada de antes de la acción** (`active_lote: null`), pisando
el estado correcto que el evento de WebSocket ya había aplicado un instante antes (el
evento de dominio, medido en la práctica, llegaba de forma consistente ANTES de que la
propia respuesta HTTP de la acción terminara de resolver del lado del cliente). El
síntoma observado: el botón "Abrir lote" quedaba funcionalmente atascado -- la acción se
ejecutaba correctamente en el backend (verificable con `GET` directo), pero la interfaz
volvía a mostrar "sin lote activo" y no se recuperaba sola.

Se eliminó el refresco de respaldo por completo. `ConsolaControlPanel` ya no recibe
ningún callback tipo `onActionSettled`/`reload` -- cada acción solo llama al endpoint,
muestra el toast de éxito/error, y confía en que el evento de WebSocket (ya unido a la
misma sala) actualice el estado. Se verificó, en la misma sesión de pruebas contra el
backend real, que esto es suficiente incluso para una cadena de eventos encadenados (por
ejemplo, cerrar el último lote pendiente dispara además la finalización automática del
remate, RF-10 -- ambos eventos, `lote.closed` y `remate.finished`, llegaron y se
aplicaron correctamente en secuencia, sin ningún refresco manual).

## Alternativas consideradas

- **Agregar props opcionales a `ActiveLotePanel`/`OfferHistoryPanel`/`UpcomingLotesStrip`
  del comprador** (`hideBidButton`, `selectable`, `highlightLatestId`): descartado por
  la sección A -- técnicamente retrocompatible, pero introduce riesgo evitable sobre
  componentes de una experiencia que esta fase tiene la instrucción explícita de no
  tocar, a cambio de un ahorro de código modesto (tres componentes relativamente chicos).
- **Reimplementar la conexión WebSocket específicamente para la consola** (un
  `useLiveOperationalState` propio, en vez de reusar `useLiveRemateState`): descartado --
  hubiera duplicado la pieza más compleja y ya probada de la Épica 4.6 (auth, heartbeat,
  reconexión, reducer de eventos) sin ningún beneficio real, ya que la consola necesita
  exactamente el mismo snapshot en vivo que la Sala.
- **Mantener el refresco HTTP de respaldo, pero con un `debounce`/delay para esquivar la
  ventana de caché de 2 segundos**: descartado -- agregar un delay artificial a un
  refresco que, en la práctica, nunca hace falta (el evento de WebSocket ya llega solo)
  cambia un bug visible por una complejidad invisible y frágil (¿cuánto delay alcanza
  siempre? ¿qué pasa si el TTL cambia?). Más simple y más correcto confiar en el
  mecanismo que ya existe para esto exactamente.
- **Pedirle al backend un endpoint de invalidación de caché tras una escritura**:
  descartado de entrada -- viola "no modificar el backend", y además es innecesario: el
  problema nunca fue la existencia del caché (correcto y documentado desde ADR-026), sino
  que el frontend no necesitaba pedir un refresco HTTP en absoluto.

## Consecuencias

- **Ventajas**: cero riesgo sobre la Sala del comprador (ningún archivo de
  `features/sala/` modificado); la consola hereda, gratis, toda la robustez ya probada de
  `useLiveRemateState` (reconexión con backoff, reconciliación de snapshot); las seis
  acciones del panel de control quedan más simples (sin un callback de refresco que
  coordinar) y, en la práctica, más rápidas (no hay una segunda request HTTP esperando
  después de cada clic); el hallazgo de la sección B queda documentado para que ningún
  módulo futuro reintroduzca el mismo patrón "refrescar por las dudas" sobre un endpoint
  con caché corta.
- **Desventajas aceptadas**: si la conexión WebSocket estuviera genuinamente caída en el
  momento exacto de una acción (un caso ya cubierto, en general, por la reconexión
  automática con backoff de `WebSocketClient`, Épica 4.6), la interfaz no se actualiza
  hasta que la reconexión se complete y el nuevo `join_room` traiga un snapshot fresco --
  se acepta este delay (segundos, acotado por el backoff) en vez de reintroducir el
  riesgo de la sección B.
- El día que exista la Consola Operativa completa (Módulo 5.3 o el que gestione
  ofertas/lotes con más profundidad), el mismo criterio aplica: cualquier acción que
  dispare un evento ya sincronizado por el Event Consumer no necesita refresco HTTP
  adicional -- confiar en el evento, no en un `reload()` de respaldo.
