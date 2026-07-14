# ADR-001: Monolito modular vs. microservicios

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

El proyecto necesita demostrar arquitectura escalable y buenas prácticas. Es tentador
asumir que "escalable" implica microservicios desde el diseño inicial, especialmente en un
proyecto de portfolio donde se quiere mostrar madurez arquitectónica. Al mismo tiempo, el
equipo real detrás del proyecto es una sola persona, y el volumen esperado (cientos/miles
de conexiones concurrentes) es escalable perfectamente dentro de un backend bien diseñado
corriendo en múltiples instancias.

## Decisión

RematAR se implementa como un **monolito modular**: un único desplegable de backend,
organizado internamente en módulos con límites explícitos (Auth, Remates, Bidding,
Realtime, Notificaciones, Streaming-integration — ver [09-arquitectura-y-decisiones.md](../09-arquitectura-y-decisiones.md)),
corriendo en múltiples instancias sin estado compartido en memoria.

## Alternativas consideradas

- **Microservicios desde el inicio** (por ejemplo, Bidding, Remates y Notificaciones como
  servicios separados con su propia base de datos): agrega complejidad operativa real
  (orquestación, tracing distribuido, consistencia eventual entre servicios, más
  infraestructura para levantar en desarrollo) que no resuelve ningún problema que este
  proyecto tenga a esta escala. Además, para un evaluador técnico, microservicios
  prematuros sin una razón de escala real leen como sobre-ingeniería, no como madurez.
- **Monolito no modular** (todo el código en un único paquete sin límites claros): más
  rápido al principio, pero no demuestra ninguna disciplina de diseño y hace mucho más
  difícil una eventual extracción a servicios si la escala algún día lo justificara.

## Consecuencias

- **Ventajas**: un solo despliegue, sin latencia de red entre módulos que colaboran
  constantemente (Bidding necesita a Remates en cada oferta), transacciones de base de
  datos simples (todo vive en el mismo proceso, no hay que coordinar transacciones
  distribuidas), curva de desarrollo mucho más rápida.
- **Desventajas aceptadas**: si en el futuro un módulo puntual (por ejemplo, Bidding)
  necesitara escalar de forma completamente independiente del resto, extraerlo requeriría
  trabajo adicional que hoy se evita. Se acepta este costo porque hoy no hay evidencia de
  que sea necesario (ver R-12 en [08-riesgos-tecnicos.md](../08-riesgos-tecnicos.md)).
- Esta decisión es la razón por la que los límites de módulo (RNF-17) importan desde el
  día uno: son lo que hace viable una extracción futura si alguna vez se necesita, sin
  tener que rediseñar el dominio.
