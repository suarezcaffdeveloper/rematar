"""History Service (Épica 7, Módulo 7.3). Ver
docs/37-historial-y-resultados-de-remates.md y ADR-040.

Top-level, transversal, mismo nivel que `app/analytics/`/`app/audit/`/`app/presence/`/
`app/snapshot/` -- no es un módulo de dominio, no tiene modelo de base de datos, no
persiste nada propio: es 100% derivado de columnas que remates/lotes/ofertas/chat ya
persisten.

Reutiliza, en vez de duplicar:

- `AnalyticsRepository` (`app/analytics/repository.py`) tal cual, para las "métricas
  finales" del detalle de un remate -- las mismas cuatro consultas que ya alimentan el
  panel en vivo (Módulo 7.1). No importa `AnalyticsService` (acoplado a `PresenceService`
  y a una caché pensada para "ahora mismo", no para un remate ya terminado).
- `LoteRepository`/`OfertaRepository` (`app/modules/remates/lotes/`,
  `app/modules/ofertas/`) tal cual, para el detalle de un lote (ganador, historial de
  ofertas) -- `get_leading_offer`/`list_by_lote` son exactamente lo que hace falta.
- El panel de auditoría ya construido (`app/audit/`, Módulo 7.2) para la "línea de
  tiempo de eventos importantes" del detalle de un remate -- **no** en el backend
  (`HistoryService` no importa nada de `app.audit`): se resuelve en el frontend
  embebiendo `AuditLogView` (scope remate) tal cual, reutilizando el endpoint
  `GET /remates/{id}/audit` que ya existe.

`HistoryRepository` (`repository.py`) implementa únicamente lo genuinamente nuevo: el
listado agregado de remates finalizados/cancelados, la duración total de un remate, la
actividad de chat, y la cantidad de participantes distintos.
"""
