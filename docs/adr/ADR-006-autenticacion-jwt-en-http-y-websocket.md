# ADR-006: Autenticación JWT en HTTP y en WebSocket

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

El sistema ya usa JWT para autenticación stateless en REST (ver [ADR-002](ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md)
y [12-stack-tecnologico.md](../12-stack-tecnologico.md)). Los WebSockets no tienen un
mecanismo estándar equivalente a un header `Authorization` en la conexión inicial de la
misma forma simple que HTTP, y la forma más obvia de pasar un token —como query param en la
URL de conexión (`wss://.../ws?token=...`)— quedaría logueada en proxies intermedios,
balanceadores y logs de acceso (R-08), exponiendo el token.

## Decisión

La conexión WebSocket se abre sin credenciales en la URL. El cliente **autentica en el
primer mensaje** enviado tras abrir la conexión, con el JWT de acceso vigente. El servidor
no acepta ninguna operación de negocio (unirse a un remate, ofertar) hasta validar ese
primer mensaje; si la validación falla o no llega en un plazo corto, la conexión se cierra.

## Alternativas consideradas

- **Token como query param de la URL**: simple de implementar, pero expone el token en
  logs de acceso de cualquier proxy/balanceador intermedio (R-08). Se descarta.
- **Token como subprotocolo WebSocket** (`Sec-WebSocket-Protocol`): evita el problema de
  logging de la URL, pero tiene límites de tamaño y compatibilidad menos consistente entre
  clientes/proxies que un mensaje de aplicación explícito. Queda como alternativa válida a
  reconsiderar si el mensaje inicial resultara insuficiente en la práctica, pero no se elige
  como decisión inicial.
- **Cookies de sesión con el handshake HTTP inicial del WebSocket**: viable, pero acopla la
  autenticación WS al mismo mecanismo de cookies del navegador, complicando clientes no-web
  y reintroduciendo estado de sesión que JWT busca evitar (RNF-05).

## Consecuencias

- **Ventajas**: el token nunca aparece en una URL logueable; el mecanismo es explícito y
  fácil de auditar (una validación clara en el primer mensaje, no un chequeo implícito del
  handshake).
- **Desventajas aceptadas**: hay una ventana breve entre "conexión abierta" y "conexión
  autenticada" en la que el servidor debe rechazar cualquier operación de negocio; esto
  agrega un estado transitorio explícito a la conexión que hay que manejar en el módulo
  Realtime (ver [ADR-003](ADR-003-websockets-nativos-vs-socketio.md)).
- El mismo JWT de corta duración usado en REST (RNF-12) se reutiliza acá; no hay un
  esquema de autenticación paralelo para WebSockets.
