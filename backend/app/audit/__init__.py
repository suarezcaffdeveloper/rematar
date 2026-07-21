"""Audit Service (Épica 7, Módulo 7.2). Ver docs/36-sistema-de-auditoria-y-trazabilidad.md
y ADR-039.

Top-level, transversal, al mismo nivel que `app/analytics/`/`app/snapshot/`/
`app/presence/` -- no es un módulo de dominio, cruza todos los bounded contexts en vez
de pertenecer a uno.

A diferencia de Analítica (100% lectura, sin modelo propio), Auditoría sí persiste
(`AuditLogEntry`) y expone dos superficies deliberadamente separadas en archivos
distintos, para evitar un import circular con `RemateService`:

- **Escritura** (`repository.py`, `AuditLogRepository`): sin ninguna dependencia de
  `app.modules.*` -- es lo que se inyecta directo en los servicios de dominio
  (`AuthService`, `RemateService`, `LoteService`, `AuctionEngine`, `ChatService`) para
  que cada uno deje constancia de sus propias acciones, en la misma transacción de la
  acción que audita (nunca vía el Event Bus, que es best-effort y puede perder un
  evento -- ver ADR-039 sección A).
- **Lectura** (`service.py`, `AuditService`): compone `RemateService` para resolver
  visibilidad/propiedad del panel scoped por remate del rematador, mismo patrón que
  `AnalyticsService`. Solo la usa `router.py`; ningún módulo de dominio la importa
  jamás (`test_architecture_boundaries.py` lo verifica).
"""
