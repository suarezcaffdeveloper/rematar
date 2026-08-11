"""Infraestructura de envío de email, agnóstica de proveedor (SMTP hoy, podría ser la
API HTTP de un proveedor transaccional después).

No confundir con `app/notifications/` (notificaciones *in-app*, filas de `Notification`
que el usuario ve en la campanita de la UI, sin relación con email). Este paquete es
puro transporte + templates; quién decide *cuándo* mandar un email vive en
`app/notify/` (orquestación multi-canal: email hoy, WhatsApp después).
"""
