# ADR-009: Redis Pub/Sub (no Streams) para el fan-out de tiempo real

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

Redis ofrece dos mecanismos candidatos para que una instancia de backend le avise a las
demás que ocurrió un evento (una oferta aceptada, un lote cerrado): **Pub/Sub** (difusión
efímera, sin persistencia, sin historial) y **Streams** (log persistente, con
consumer groups, replay posible). Hay que elegir cuál es el backplane de difusión entre
instancias del backend (ver [ADR-002](ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md)).

## Decisión

Se usa **Redis Pub/Sub** para el fan-out de eventos en tiempo real entre instancias. El rol
de "log persistente y con replay" que Streams ofrecería ya lo cumple **PostgreSQL** (que es
la fuente de verdad de negocio, y de donde se arma el snapshot de reconexión — ver
[ADR-008](ADR-008-snapshot-mas-delta-para-reconexion.md)), así que no hace falta que Redis
cumpla ese rol también.

## Alternativas consideradas

- **Redis Streams** para el fan-out: daría persistencia y posibilidad de replay de eventos
  perdidos, resolviendo R-04 desde el broker de mensajería en vez de aceptarlo como riesgo.
  Se descarta porque duplicaría una responsabilidad que Postgres ya cumple (persistencia y
  fuente de verdad), agregando complejidad (consumer groups, manejo de acknowledgments,
  crecimiento del stream) para un beneficio que el diseño de snapshot-al-reconectar ya
  cubre de otra forma, más simple.
- **Un message broker dedicado (Kafka/RabbitMQ)**: apropiado para volúmenes de eventos
  mucho mayores o para necesidades de event sourcing serio, pero es infraestructura
  operativa adicional sin un problema real que resuelva a esta escala (mismo argumento que
  en [ADR-001](ADR-001-modular-monolito-vs-microservicios.md) contra microservicios
  prematuros).

## Consecuencias

- **Ventajas**: Pub/Sub es la pieza más simple posible para el único trabajo que
  realmente necesita hacer (avisarle a otras instancias en tiempo real), sin infraestructura
  ni conceptos adicionales que mantener.
- **Desventajas aceptadas**: si una instancia está caída o desconectada de Redis en el
  instante exacto de un publish, pierde ese mensaje sin posibilidad de recuperarlo después
  (R-04). Se acepta explícitamente porque ningún cliente depende de Pub/Sub para conocer el
  estado correcto — depende del snapshot contra Postgres al conectarse/reconectarse.
- Si en el futuro surgiera una necesidad real de event sourcing completo (por ejemplo, para
  analítica de comportamiento de ofertas en tiempo real), esa sería una decisión nueva,
  documentada como ADR aparte, no una extensión silenciosa de esta.
