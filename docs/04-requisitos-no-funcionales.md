# 04 — Requisitos No Funcionales

Estos son objetivos de diseño, no SLAs contractuales — el proyecto es un portfolio, pero
se diseña como si los números importaran de verdad, porque son los que justifican las
decisiones de arquitectura (Redis como backplane, locking en Postgres, etc.).

## Rendimiento

- **RNF-01**: Difusión de una oferta aceptada a todos los clientes conectados a un mismo
  remate en menos de 300ms (p95) bajo carga nominal.
- **RNF-02**: Validación y aceptación/rechazo de una oferta (ida y vuelta con quien la
  envió) en menos de 150ms (p95), sin contar latencia de red del cliente.
- **RNF-03**: Las lecturas de solo consulta (listado de remates, historial) no deben
  competir por los mismos locks que el path caliente de bidding.

## Escalabilidad

- **RNF-04**: El sistema debe soportar, como objetivo de diseño, al menos 2000 conexiones
  WebSocket concurrentes distribuidas en múltiples instancias del backend corriendo
  simultáneamente (no un único proceso).
- **RNF-05**: Ninguna instancia del backend debe depender de estado en memoria que no
  pueda reconstruirse o compartirse vía Redis/Postgres — condición necesaria para escalar
  horizontalmente agregando instancias sin coordinación especial.
- **RNF-06**: El número de remates simultáneos en `LIVE` no debe estar acotado por diseño
  a un valor fijo (más allá de los límites de infraestructura).

## Disponibilidad y resiliencia

- **RNF-07**: Si una instancia del backend cae, un cliente conectado a ella debe poder
  reconectarse a otra instancia y recuperar el estado exacto del remate (snapshot) en
  menos de 5 segundos.
- **RNF-08**: La caída de Redis no debe corromper datos de negocio: en el peor caso, se
  pierde difusión en tiempo real temporalmente, pero PostgreSQL sigue siendo la fuente de
  verdad de qué ofertas fueron aceptadas.

## Consistencia

- **RNF-09**: La aceptación de una oferta como "ganadora vigente" debe ser fuertemente
  consistente: en ningún momento pueden coexistir dos ofertas "vigentes" contradictorias
  para el mismo lote.
- **RNF-10**: Datos de naturaleza efímera y no crítica (contador de espectadores conectados,
  presencia) pueden ser eventually consistent — no justifican pagar el costo de
  consistencia fuerte.

## Seguridad

- **RNF-11**: Toda regla de negocio (incremento mínimo, estado del lote, permisos) se
  valida exclusivamente en el servidor. El cliente nunca es una fuente confiable de verdad.
- **RNF-12**: Los tokens de acceso son de corta duración; el refresh token permite renovar
  sin pedir credenciales de nuevo, pero es revocable.
- **RNF-13**: Rate limiting de ofertas por usuario/conexión para mitigar spam y ataques de
  fuerza bruta sobre el bidding.
- **RNF-14**: Aislamiento multi-tenant estricto: ninguna operación de un rematador puede
  leer ni mutar datos de un remate que no le pertenece, validado a nivel de servidor en
  cada operación, no solo ocultado en la UI.

## Observabilidad

- **RNF-15**: Toda oferta procesada (aceptada o rechazada) y toda transición de estado de
  remate/lote debe quedar loggeada de forma estructurada, con contexto suficiente para
  reconstruir qué pasó ante una disputa.
- **RNF-16**: El sistema expone métricas mínimas de salud (conexiones WS activas, latencia
  de broadcast, tasa de ofertas rechazadas) — el detalle de qué herramienta se usa queda
  para el roadmap ([13-mvp-y-roadmap.md](13-mvp-y-roadmap.md)), pero el requisito de que
  existan boundaries para instrumentarlas es del MVP.

## Mantenibilidad

- **RNF-17**: El backend se organiza en módulos con límites explícitos (auth, remates,
  bidding, notificaciones) que puedan evolucionar o incluso extraerse a servicios
  separados en el futuro sin reescribir el dominio. Ver [ADR-001](adr/ADR-001-modular-monolito-vs-microservicios.md).
- **RNF-18**: Todo cambio de esquema de base de datos se versiona con migraciones
  (Alembic); nunca se edita el esquema a mano contra una base existente.

## Portabilidad

- **RNF-19**: El entorno completo (backend, Postgres, Redis, frontend) debe poder
  levantarse con un único comando de Docker Compose en cualquier máquina de desarrollo.
