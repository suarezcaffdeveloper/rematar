# ADR-005: Transmisión en vivo fuera del alcance del MVP

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

El pedido original incluye que los compradores puedan "visualizar la transmisión en vivo"
de un remate. Tomado literalmente, esto implica construir infraestructura de streaming de
video: ingesta desde el rematador (RTMP/WebRTC), transcodificación, empaquetado (HLS/DASH),
distribución de baja latencia a potencialmente miles de espectadores, y opcionalmente CDN.
Cada una de esas piezas es, por sí sola, un proyecto de infraestructura de medios
significativo, con problemas propios (buffering, códecs, ancho de banda, costo de
transcodificación) que no tienen relación con los objetivos técnicos declarados del
proyecto (backend, WebSockets, Redis, concurrencia, escalabilidad — ver [01-vision-general.md](../01-vision-general.md)).

## Decisión

**El MVP no construye infraestructura de streaming propia.** El "video en vivo" se resuelve
embebiendo/enlazando una URL de transmisión externa que el rematador ya genera por otro
medio (por ejemplo, un link HLS/RTMP de un servicio de terceros que el rematador usa para
transmitir). El módulo `Streaming-integration` del backend solo asocia y resuelve esa URL
al remate correspondiente; no procesa video en ningún punto.

## Alternativas consideradas

- **Streaming propio desde el MVP**: se presentó explícitamente al usuario como opción y
  se descartó porque compite directamente por tiempo y foco con los objetivos técnicos
  centrales del portfolio, sin aportar a ellos.
- **Placeholder total** (ni siquiera integrar una URL real, solo un espacio reservado en la
  UI): se descartó porque pierde la posibilidad de demostrar el flujo completo
  "remate en vivo" de punta a punta durante una demo, que sí tiene valor para el portfolio.
  La integración simple da ese valor sin el costo de construir infraestructura de medios.

## Consecuencias

- **Ventajas**: cero tiempo de desarrollo invertido en un dominio (video) ajeno al objetivo
  del proyecto; el remate se puede demostrar de punta a punta igual, con un rematador
  transmitiendo por un servicio externo cualquiera.
- **Desventajas aceptadas**: el rematador depende de una herramienta externa para generar
  su transmisión, y la plataforma no controla la calidad ni la disponibilidad de esa
  transmisión. Se acepta porque no es un problema que este proyecto se proponga resolver.
- Streaming propio queda documentado como ítem de roadmap futuro (ver
  [13-mvp-y-roadmap.md](../13-mvp-y-roadmap.md)), a abordar solo si en algún momento se
  justifica como una fase de proyecto aparte.
