# ADR-003: WebSockets nativos vs. Socket.IO

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

El canal de tiempo real es el corazón técnico del proyecto. Hay que elegir entre
implementar el protocolo de mensajes sobre WebSockets nativos (los que expone
FastAPI/Starlette directamente) o apoyarse en una librería de más alto nivel como
Socket.IO, que agrega reconexión automática, salas (rooms) y fallback a polling.

## Decisión

Se usan **WebSockets nativos**, con un protocolo de mensajes propio y versionado (mensajes
JSON con un campo de tipo y versión de esquema — ver nota en [06-eventos-del-sistema.md](../06-eventos-del-sistema.md)),
y la lógica de "salas" (agrupar conexiones por remate) y reconexión con snapshot
implementada explícitamente en el módulo Realtime.

## Alternativas consideradas

- **Socket.IO**: da reconexión automática y agrupación en salas "gratis", y tiene buen
  soporte en el ecosistema JS. Se descarta por dos razones: (1) agrega una dependencia
  pesada tanto en frontend como backend, y un protocolo propio sobre el wire que complica
  interoperar con clientes que no sean su propia librería; (2) para los objetivos técnicos
  de este proyecto (demostrar dominio de sistemas de tiempo real), delegarle a una
  librería justamente el problema que se quiere mostrar que se sabe resolver —manejo de
  reconexión, agrupación de conexiones, entrega de estado— reduce el valor demostrativo del
  código, no lo aumenta.
- **Server-Sent Events (SSE) en vez de WebSockets**: SSE es unidireccional
  (servidor→cliente), lo cual serviría para difundir ofertas pero no para que el
  comprador oferte por el mismo canal, obligando a un canal aparte (POST HTTP) para el
  envío. Se descarta porque bidding bidireccional de baja latencia es exactamente el caso
  de uso para el que WebSockets fue pensado.

## Consecuencias

- **Ventajas**: control total del protocolo, sin dependencias externas pesadas, mayor
  valor demostrativo del diseño propio de reconexión/agrupación/versión de mensajes.
- **Desventajas aceptadas**: hay que implementar a mano lo que Socket.IO regala
  (reconexión con backoff en el cliente, agrupación de conexiones por remate en el
  servidor). Se acepta porque es precisamente el trabajo que este proyecto existe para
  demostrar.
- Esta decisión implica que el diseño de snapshot-al-reconectar ([ADR-008](ADR-008-snapshot-mas-delta-para-reconexion.md))
  es responsabilidad explícita del módulo Realtime, no delegable a una librería.
