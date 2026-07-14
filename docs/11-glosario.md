# 11 — Glosario

| Término | Definición |
|---|---|
| **Remate** | Evento organizado por un rematador, compuesto por una secuencia ordenada de lotes, con un ciclo de vida propio (`DRAFT` → ... → `FINISHED`/`CANCELLED`). |
| **Lote** | Ítem individual dentro de un remate, rematado de forma secuencial (uno a la vez), con precio inicial e incremento mínimo propios. |
| **Oferta / Puja** | Propuesta de monto que un comprador envía sobre el lote abierto. Se usan como sinónimos en este proyecto. |
| **Incremento mínimo** | Monto mínimo en que una nueva oferta debe superar a la oferta vigente para ser válida. |
| **Oferta vigente / leading bid** | La oferta `ACCEPTED` de mayor monto para un lote en un instante dado; es un valor derivado, no un campo replicado. |
| **Rematador** | Rol que crea y administra remates y lotes propios, controla el ritmo del remate en vivo. |
| **Comprador** | Rol que se une a remates, oferta y sigue remates de interés. |
| **Multi-tenant** | Modelo en el que múltiples rematadores operan de forma aislada entre sí sobre la misma plataforma, sin visibilidad ni acceso cruzado a los datos de otro. |
| **Anti-sniping** | Mecanismo que extiende automáticamente el cierre de un lote si llega una oferta válida en los últimos segundos, para evitar que alguien "robe" el lote justo al vencer el timer. |
| **Shill bidding** | Práctica fraudulenta de ofertar (uno mismo o un cómplice) sobre el propio lote para inflar artificialmente el precio. |
| **Snapshot** | Estado completo y actual de un remate (lote activo, oferta vigente, tiempo restante) que se envía a un cliente al conectarse o reconectarse, en vez de reproducir el historial completo de eventos. |
| **Backplane** | Mecanismo de coordinación entre múltiples instancias de un mismo servicio; acá, Redis Pub/Sub, que permite que un evento originado en una instancia llegue a los clientes conectados a cualquier otra. |
| **Fan-out** | Difusión de un mismo mensaje a múltiples destinatarios (todos los clientes conectados a un remate). |
| **Sticky session** | Técnica de balanceo de carga que fija a un mismo cliente siempre a la misma instancia de backend; este proyecto la evita para conexiones WS gracias al backplane de Redis (ver [ADR-002](adr/ADR-002-postgres-fuente-de-verdad-y-redis-como-soporte.md)). |
| **Idempotencia** | Propiedad de una operación que produce el mismo resultado si se repite; relevante para reintentos de ofertas ante fallas de red transitorias. |
| **Row-level locking / `SELECT FOR UPDATE`** | Mecanismo de PostgreSQL para bloquear una fila específica durante una transacción, usado para serializar la validación de ofertas concurrentes sobre el mismo lote. |
| **Modular monolith / monolito modular** | Estilo arquitectónico de un único desplegable organizado internamente en módulos con límites claros, en oposición a microservicios distribuidos desde el inicio. |
| **Event-driven (interno)** | Patrón en el que los módulos se comunican reaccionando a eventos de dominio en vez de llamarse directamente unos a otros, reduciendo acoplamiento. |
| **JWT (JSON Web Token)** | Token firmado y auto-contenido usado para autenticación stateless entre cliente y backend. |
| **ADR (Architecture Decision Record)** | Documento que registra una decisión de arquitectura, su contexto, alternativas consideradas y consecuencias aceptadas. |
| **Presencia** | Información efímera sobre quién está conectado a un remate en un momento dado (ej. contador de espectadores); se trata como eventually consistent. |
