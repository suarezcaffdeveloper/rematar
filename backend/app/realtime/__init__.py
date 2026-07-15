"""Sincronización de eventos en tiempo real (Épica 3, Módulo 3.5). Ver
docs/22-sincronizacion-tiempo-real.md y ADR-025.

El único paquete que conoce, a la vez, al Event Bus (`app/events/`, eventos de dominio
concretos en `app/modules/*/events.py`) y al Gateway WebSocket (`ConnectionManager`,
`RoomManager` en `app/websocket/`) — la conexión entre ambos mundos vive acá y en
ningún otro lado. Ni `app/websocket/` ni el Auction Engine (`app/modules/ofertas/`)
importan nada de este paquete: la dependencia es siempre en un solo sentido,
`app/realtime/` -> los otros dos, nunca al revés.
"""
