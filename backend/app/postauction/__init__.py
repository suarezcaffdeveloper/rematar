"""PostAuction Service (Épica 7, Módulo 7.5). Ver docs/41-gestion-post-remate.md y
ADR-044.

Paquete top-level, hermano de `app/audit/`, `app/history/`, `app/monitoring/` -- no
`app/modules/postauction/` -- mismo criterio: un compositor/reactor con tabla propia que
vive *sobre* el dominio de subastas sin ser parte de él. `app/modules/remates/` no importa
nada de acá (la dirección de dependencia va en un solo sentido, igual que
Auditoría/Historial/Analítica) y se entera de que un lote fue adjudicado reaccionando al
evento `lote.winner_determined` ya publicado por `LoteService.auto_close` -- nunca por una
llamada directa desde `app/modules/remates/lotes/service.py`, que no se toca en absoluto.
"""
