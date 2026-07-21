"""Analytics Service (Épica 7, Módulo 7.1). Ver docs/35-dashboard-analitica-tiempo-real.md
y ADR-038.

Compositor de lectura, transversal, al mismo nivel que `app/snapshot/`/`app/presence/`:
no es un módulo de dominio, no tiene modelo de base de datos, no persiste nada propio.
Cada métrica es una consulta agregada directa sobre `Oferta`/`Lote` (ya persisten todo
lo necesario, ver `Lote.opened_at`/`closed_at`/`final_price`) más el conteo de
`PresenceService` (`app/presence/`, Módulo 6.2) -- sin eventos de dominio nuevos, sin
consumidor propio, sin nada que idempotizar.
"""
