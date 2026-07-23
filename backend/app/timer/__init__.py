"""Timer Service (Épica 8, "cuenta regresiva y cierre automático de lotes"). Ver
docs/40-cuenta-regresiva-y-cierre-automatico.md y ADR-007/ADR-043.

Paquete transversal top-level, mismo nivel que `app/snapshot/`/`app/monitoring/`: sin
modelo propio (el estado del timer vive en columnas de `Lote`, ver
`app/modules/remates/lotes/models.py`), pero sí depende de módulos de dominio
(`app.modules.remates`, `app.modules.remates.lotes`) para operar sobre ellos -- mismo
perfil de dependencia que `app/snapshot/` ya tiene hacia `app.modules.ofertas`.
"""
