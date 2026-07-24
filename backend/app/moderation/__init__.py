"""Moderation Service (Épica 7, Módulo 7.6). Ver docs/42-moderacion-en-tiempo-real.md y
ADR-045.

Paquete top-level, hermano de `app/modules/chat/` y `app/modules/ofertas/` -- no vive
dentro de ninguno de los dos, mismo criterio que `app/postauction/`/`app/audit/`: un
servicio que reacciona/se engancha con el dominio de chat y de ofertas sin ser parte de
ellos. `ChatService`/`ChatMessage`/`AuctionEngine`/`Oferta` no importan nada de acá --
la dirección de dependencia va en un solo sentido, verificada por
`tests/test_architecture_boundaries.py`. Se entera de intentos de oferta inválidos
reaccionando a `oferta.rejected` (ya publicado hoy por `AuctionEngine.place_bid`) con su
propio `EventConsumer`, nunca por una llamada directa desde `app/modules/ofertas/`.
"""
