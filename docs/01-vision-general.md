# 01 — Visión General

## 1. Descripción completa del proyecto

RematAR es una plataforma web **multi-tenant** de remates en vivo. "Multi-tenant" en el
sentido de que cualquier cantidad de rematadores, sin relación entre sí, puede operar
remates propios de forma totalmente independiente y simultánea en la misma plataforma:
lo que pasa en el remate del rematador A no afecta ni es visible como administrable para
el rematador B.

Un remate se compone de una secuencia ordenada de **lotes**. Cada lote es un ítem individual
a rematar, con su propio precio inicial, incremento mínimo y estado. Los lotes se rematan
de a uno por vez: el rematador abre un lote, los compradores conectados ofertan en tiempo
real, el rematador lo cierra, el sistema determina el ganador automáticamente, y recién ahí
se pasa al siguiente lote.

El flujo de dinero y entrega del bien **no** es responsabilidad de la plataforma en el MVP:
una vez determinado el ganador, el contacto para coordinar pago y entrega ocurre fuera del
sistema. Esto es una decisión deliberada de acotar el alcance (ver [13-mvp-y-roadmap.md](13-mvp-y-roadmap.md)).

El proyecto se diseña y se construye como si fuera un producto real de una startup: con
requisitos no funcionales explícitos, decisiones de arquitectura documentadas y trade-offs
discutidos, no como un ejercicio didáctico de CRUD.

## 2. Objetivos funcionales

- Permitir que un rematador cree y administre remates y lotes de forma independiente de
  otros rematadores.
- Permitir que compradores descubran remates (en vivo, programados, finalizados), se unan
  a uno, vean la transmisión y ofertes en tiempo real.
- Garantizar que el ganador de cada lote se determine de forma automática, consistente y
  auditable, sin intervención manual ni ambigüedad.
- Permitir pausar y reanudar un remate en curso sin perder el estado de ofertas ni el
  lote activo.
- Permitir que un comprador siga remates de interés y reciba notificaciones relevantes.
- Permitir que un comprador consulte su propio historial de ofertas y remates ganados.
- Permitir que un rematador consulte el historial completo de ofertas de sus remates,
  incluyendo las rechazadas, para trazabilidad ante disputas.

## 3. Objetivos técnicos

Este es el proyecto de portfolio principal del autor. El código debe demostrar, en orden
de prioridad:

1. **Manejo correcto de concurrencia real**: múltiples ofertas casi simultáneas sobre el
   mismo lote no deben producir un ganador ambiguo ni datos corruptos. Ver [ADR-004](adr/ADR-004-concurrencia-en-determinacion-de-ganador.md).
2. **Arquitectura de tiempo real escalable horizontalmente**: WebSockets con un backplane
   de difusión (Redis Pub/Sub) que permita correr múltiples instancias del backend sin que
   un cliente conectado a la instancia X deje de recibir eventos originados en la instancia Y.
3. **Uso de Redis más allá de cache**: pub/sub para fan-out, rate limiting de ofertas,
   estado efímero (presencia/viewers).
4. **Diseño de dominio explícito**: máquinas de estado formales para Remate, Lote y Oferta
   (ver [07-maquinas-de-estado.md](07-maquinas-de-estado.md)), no flags booleanos sueltos.
5. **FastAPI en modo async de verdad**: I/O no bloqueante en los paths calientes (bidding),
   tipado y validación con Pydantic.
6. **Buenas prácticas de proyecto**: migraciones versionadas con Alembic, arquitectura
   modular con límites claros entre módulos, decisiones registradas como ADR, testing de
   la lógica de concurrencia, contenedores reproducibles con Docker Compose.
7. **Preparación para escala**: diseño pensado para cientos o miles de conexiones WS
   concurrentes distribuidas en múltiples instancias, no para un único proceso monolítico
   en memoria.

## Nota del arquitecto: qué queda deliberadamente fuera del núcleo

El pedido original incluye "visualizar la transmisión en vivo". Evaluado como arquitecto,
construir infraestructura propia de streaming de video (ingesta, transcodificación, CDN,
WebRTC/RTMP) es un proyecto de infraestructura de medios en sí mismo — no aporta a ninguno
de los objetivos técnicos de arriba, y compite por tiempo y foco con ellos.

**Decisión (confirmada con el usuario):** en el MVP, "video en vivo" se resuelve con una
integración simple — el sistema embebe/enlaza una URL de transmisión externa que el
rematador ya genera por otro medio (por ejemplo, un link de streaming HLS/RTMP de un
servicio de terceros). No hay servidor de medios propio. El streaming propio queda
documentado como funcionalidad futura en el roadmap. Ver [ADR-005](adr/ADR-005-transmision-en-vivo-fuera-de-alcance-del-mvp.md).

Esto no es una limitación técnica del equipo: es una decisión de foco. El valor
demostrable de este proyecto está en el backend de tiempo real, no en un reproductor de
video.
