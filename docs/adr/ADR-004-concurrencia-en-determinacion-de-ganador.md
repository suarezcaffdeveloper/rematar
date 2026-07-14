# ADR-004: Concurrencia en la determinación del ganador de un lote

- **Fecha**: 2026-07-13
- **Estado**: Aceptada

## Contexto

Este es el problema técnico más crítico del proyecto (R-01). Múltiples compradores pueden
enviar ofertas casi simultáneas sobre el mismo lote, potencialmente procesadas por
instancias de backend distintas. Si dos ofertas se validan contra el mismo "monto vigente"
leído al mismo tiempo, ambas podrían aceptarse como válidas cuando en realidad solo una
debería serlo (la primera en confirmarse), o peor, el ganador final del lote podría quedar
mal determinado.

## Decisión

Toda validación y aceptación de una oferta ocurre dentro de una **transacción de
PostgreSQL que toma un lock a nivel de fila sobre el lote** (`SELECT ... FOR UPDATE`) antes
de leer la oferta vigente y comparar el nuevo monto. Esto serializa, a nivel de ese lote
específico, todas las ofertas concurrentes que compitan por él — sin importar desde qué
instancia de backend se procesen, porque el lock vive en la base de datos, no en memoria de
proceso. La misma transacción determina el ganador al cerrar el lote.

## Alternativas consideradas

- **Redis como árbitro rápido** (evaluado explícitamente con el usuario, ver también
  [ADR-002](ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md)): resolver la
  comparación en memoria vía operaciones atómicas de Redis (o un script Lua) para evitar el
  costo de una transacción de Postgres en el camino caliente. Se descarta porque introduce
  una segunda fuente de verdad y un riesgo real de inconsistencia si la persistencia
  asíncrona a Postgres falla o se retrasa, justo en la operación que el producto no puede
  darse el lujo de tener ambigua.
- **Optimistic locking** (leer el monto vigente sin lock, escribir con una condición
  `WHERE monto_vigente = <lo que leí>`, y reintentar si falla): funciona, pero bajo alta
  contención sobre un mismo lote (el escenario exacto que se quiere soportar bien) genera
  reintentos en cascada y no ofrece ninguna ventaja de rendimiento clara frente al lock
  pesimista para este volumen de escritura por fila. Se descarta a favor de la opción más
  simple de razonar.
- **Cola de mensajes que serializa ofertas por lote** (ej. una cola dedicada por lote_id):
  resolvería la serialización, pero agrega infraestructura adicional (gestión de colas,
  orden de entrega garantizado) para resolver un problema que un lock de fila en la base de
  datos ya resuelve de forma más simple y con las mismas garantías transaccionales.

## Consecuencias

- **Ventajas**: consistencia fuerte garantizada por el motor de base de datos, sin lógica
  de coordinación distribuida hecha a mano; fácil de razonar, testear y auditar.
- **Desventajas aceptadas**: el lock de fila serializa las ofertas de un mismo lote — dos
  ofertas simultáneas sobre el mismo lote no se procesan en paralelo, se ponen en cola
  brevemente. Esto es aceptable porque (a) es exactamente la semántica de negocio correcta
  (solo puede haber una oferta vigente a la vez) y (b) el volumen de ofertas concurrentes
  sobre un único lote puntual está naturalmente acotado por cuántos compradores compiten
  por ese ítem específico, no por el total de conexiones a la plataforma.
- Este diseño requiere tests de integración que disparen ofertas concurrentes reales
  contra Postgres (R-11), no solo tests unitarios de la función de validación aislada.
