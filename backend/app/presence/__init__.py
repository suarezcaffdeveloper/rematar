"""Presence Service (Épica 6, Módulo 6.2). Ver docs/33-sistema-de-presencia.md y
ADR-036.

Centraliza el join/leave de sala y la publicación de eventos de presencia
(`presencia.usuario_conectado`/`presencia.usuario_desconectado`, ya nombrados desde
Fase 0 en docs/06-eventos-del-sistema.md), sin modificar `RoomManager` ni
`ConnectionManager` (`app/websocket/`), que se mantienen "tontos" y sin conocer el
Event Bus. Reutiliza el pipeline de sincronización en tiempo real ya existente
(`app/realtime/`) sin tocarlo: agregar los dos eventos nuevos a
`app/realtime/registry.py` es la única integración necesaria.

Transversal, al mismo nivel que `app/snapshot/`: no es un módulo de dominio, no tiene
modelo de base de datos, no importa nada de `app/modules/remates/` ni
`app/modules/ofertas/`.
"""
