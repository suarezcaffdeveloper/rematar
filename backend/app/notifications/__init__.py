"""Notification Service mínimo (Épica 7, Módulo 7.5). Ver docs/41-gestion-post-remate.md
y ADR-044.

No existía ningún módulo de notificaciones antes de esta fase (se verificó explícitamente:
solo un comentario en `app/api/router.py` lo mencionaba como fase futura). Esta versión es
deliberadamente mínima -- persistencia simple + lectura propia, sin `service.py` (no hay
lógica de negocio más allá de "es tuyo, marcalo leído") -- y genérica: no importa nada de
`app.postauction` ni de ningún otro módulo de dominio. Quien quiera notificar a un usuario
importa `app.notifications.repository` directo (mismo criterio que cualquier módulo de
dominio con `app.audit.repository`) y llama `create(...)` en su propia transacción.
"""
