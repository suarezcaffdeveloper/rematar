"""Snapshot Service (Épica 3, Módulo 3.6). Ver docs/23-snapshot-service.md y ADR-026.

Reconstruye el estado completo y actual de un remate (info del remate, lote activo,
oferta ganadora, historial reciente, conexiones activas) para un cliente que se conecta
a mitad de un remate en vivo y necesita algo más que "esperar el próximo evento".

Transversal, reutilizable por cualquier transporte: no depende de `app/websocket/` ni de
`app/realtime/` para funcionar — el Gateway lo *usa* (uno de varios consumidores
posibles), no al revés. Lee del dominio (`RemateService`, repositorios de Lote/Oferta)
sin modificar ninguno de esos archivos.
"""
