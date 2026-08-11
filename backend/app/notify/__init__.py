"""Orquestación de notificaciones salientes al ganador de un lote, multi-canal por
diseño: `NotificationChannel` (canal.py) es un `Protocol` que hoy implementa
`EmailNotificationChannel` (email_channel.py, sobre `app/email/`) y que en el futuro
puede implementar un canal de WhatsApp sin que `PostAuctionService` ni el resto del
dominio necesiten cambiar -- solo agregar el canal nuevo a la lista en
`dependencies.py::build_notification_service`.

No confundir con `app/notifications/` (notificaciones *in-app*, filas de `Notification`
en la campanita de la UI) -- son conceptos distintos que hoy conviven: al adjudicarse un
lote se crean ambas (ver `PostAuctionService.create_case_from_winner`).
"""
