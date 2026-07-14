# ADR-021: Integración de Redis — cliente compartido y capas de infraestructura

- **Fecha**: 2026-07-16
- **Estado**: Aceptada

## Contexto

[ADR-002](ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md) y
[ADR-009](ADR-009-redis-pubsub-vs-streams-para-fanout.md) (Fase 0) ya decidieron **qué
rol** cumple Redis en el sistema (soporte, nunca fuente de verdad; Pub/Sub para fan-out,
no Streams). Faltaba decidir **cómo** se integra técnicamente: cuántas instancias del
cliente conviven, quién administra su ciclo de vida, qué pasa si no está disponible, y
cómo se expone a los módulos que lo van a consumir sin que cada uno reinvente la
conexión. La Épica 3.2 (WebSockets) va a depender de estas decisiones sin poder
revisarlas caso por caso.

## Decisión

### A. Un único cliente compartido, no uno por request

`redis.asyncio.Redis` se instancia **una vez**, en el `lifespan` de la aplicación
(`app/main.py`), y se guarda en `app.state.redis`. Todos los requests HTTP de hoy — y
todas las conexiones WebSocket de la Épica 3.2 — reutilizan la misma instancia vía
`Depends(get_redis_client)`. Es la diferencia deliberada frente a `get_db` (una
`AsyncSession` nueva por request): Redis ya administra un pool de conexiones TCP
internamente, pensado para vivir tanto como el proceso, no tanto como un único request.

### B. Conexión perezosa, sin verificar en el arranque

`build_redis_client` no abre ningún socket — `redis-py` conecta en el primer comando
real. El `lifespan` no hace un `PING` de verificación al arrancar: si Redis no está
disponible en ese instante, la aplicación igual levanta (Postgres sigue siendo la única
dependencia dura para servir la API). El primer intento de usar Redis (o una llamada a
`/health`) es lo que revela si está disponible.

### C. `/health` nunca devuelve error por Redis caído (soft-fail)

`GET /health` intenta un `PING` y reporta `checks.redis: "ok"` o `"unavailable"`, pero
el código de estado HTTP siempre es `200` — nunca `503` por causa de Redis. Ver
docs/18-integracion-redis.md para el razonamiento completo: es consecuencia directa de
ADR-002 (Redis nunca es fuente de verdad), y evita que un orquestador reinicie un proceso
que todavía puede atender la mayoría de su tráfico (todo lo que no sea tiempo real).

### D. Cuatro wrappers genéricos, sin conocimiento de dominio

`RedisCache`, `RedisPubSub`, `RedisStreams`, `RedisLockFactory` (`app/redis/*.py`) son
utilidades puras: reciben claves/canales/streams como parámetros de quien las llama, sin
ninguna referencia a `Remate`/`Lote`/`Oferta`. Es el mismo principio que ya aplican los
repositorios de cada módulo de dominio respecto a HTTP — acá se aplica a Redis respecto
al dominio completo. El motivo concreto es el enunciado de este módulo: preparar la
infraestructura sin escribir lógica de negocio todavía.

### E. `decode_responses=True`

El cliente compartido decodifica todas las respuestas a `str` (no `bytes`). Los usos
previstos (mensajes de Pub/Sub, valores de cache, campos de Streams) van a ser texto —
mayormente JSON serializado — en el 100% de los casos previstos por el roadmap; decidir
esto ahora, una sola vez, evita que cada módulo futuro tenga que decodificar manualmente
o decida cada uno a su manera.

### F. Ubicación: `app/redis/`, transversal, no un módulo de dominio

Mismo criterio que `app/db/`: infraestructura de acceso a un motor de datos concreto,
sin modelos de negocio. No es `app/modules/redis/` porque Redis no es un recurso de
dominio con su propio ciclo de vida CRUD — es infraestructura que cualquier módulo
consume, igual que `app/db/session.py`.

## Alternativas consideradas

- **Un cliente Redis nuevo por request** (mismo patrón que `get_db`): se descarta —
  Redis no necesita aislamiento transaccional por request como sí lo necesita Postgres
  (ADR-004 depende de eso), y abrir/cerrar una conexión TCP en cada request desperdicia
  el punto entero de tener un pool. Además, una conexión WebSocket de larga duración no
  tiene un "final de request" natural donde cerrarla.
- **Verificar la conexión a Redis en el arranque y fallar si no está disponible**: se
  descarta — acoplaría la disponibilidad de la API REST completa (que hoy no depende de
  Redis para nada) a la disponibilidad de una pieza que, por diseño (ADR-002), es
  soporte prescindible en el corto plazo. Preferible que la app arranque y `/health`
  reporte el problema, no que el proceso entero no levante.
- **`/health` devuelve `503` si Redis no responde**: se descarta por la misma razón que
  el punto anterior — mezclaría "la API no puede atender tráfico" (correcto motivo para
  `503`) con "una funcionalidad de soporte está degradada" (no lo es, todavía ni
  siquiera existe tráfico que dependa de Redis).
- **Wrappers con nombres/métodos específicos de un caso de uso futuro** (por ejemplo,
  `OfertaCache` o `RemateChannel`): se descarta explícitamente por el enunciado de este
  módulo ("no implementar lógica de negocio utilizando Redis") — cualquier wrapper con
  nombre de dominio sería, en los hechos, empezar a diseñar el módulo de tiempo real
  antes de tiempo.
- **`aioredis` en vez de `redis-py` con soporte async nativo**: `aioredis` está
  discontinuado y fusionado dentro de `redis-py` desde su versión 4.2 — no hay razón
  para agregar una dependencia separada que el propio paquete `redis` ya cubre.

## Consecuencias

- **Ventajas**: cualquier módulo futuro obtiene Redis vía `Depends()`, sin duplicar
  lógica de conexión; el ciclo de vida (creación, cierre) está centralizado y es
  correcto tanto en producción (uvicorn dispara el `lifespan` real) como en tests
  (`app.router.lifespan_context`, ver docs/18); la ausencia de Redis nunca tumba la API
  REST existente.
- **Desventajas aceptadas**: como la conexión es perezosa y el arranque no la verifica,
  un error de configuración de `REDIS_URL` no se detecta hasta el primer uso real (o
  hasta consultar `/health`) — se acepta porque es exactamente el mismo trade-off que ya
  eligió este proyecto para no acoplar el arranque de la API a un componente de soporte.
- Cuando la Épica 3.2 agregue WebSockets, el trabajo pendiente es exclusivamente diseño
  de protocolo y canales de dominio — la conexión, su ciclo de vida y el mecanismo de
  Pub/Sub ya están resueltos acá y no deberían necesitar cambios.
