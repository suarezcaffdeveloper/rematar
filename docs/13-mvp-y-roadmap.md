# 13 — MVP y Roadmap

## Funcionalidades del MVP

El criterio de corte: **todo lo que sea necesario para demostrar el ciclo de vida completo
de un remate real, con bidding concurrente correcto y escalable, entra. Todo lo que sea
infraestructura auxiliar reemplazable por una integración externa simple, no.**

- Autenticación con roles (`admin`, `rematador`, `comprador`), JWT con refresh.
- CRUD de remates y lotes por parte del rematador (RF-04 a RF-07).
- Ciclo de vida completo de remate y lote con sus máquinas de estado (07).
- Bidding en tiempo real vía WebSocket, con validación server-side estricta.
- Determinación automática y transaccionalmente segura del ganador de cada lote.
- Anti-sniping (extensión automática de cierre) — barato de implementar, alto valor
  demostrativo de manejo de timers del lado servidor.
- Snapshot + reconexión sin pérdida de contexto (RF-16, [ADR-008](adr/ADR-008-snapshot-mas-delta-para-reconexion.md)).
- Seguimiento de remates y notificación de inicio/superado.
- Historial de ofertas del comprador y del rematador (incluye rechazadas).
- Video: integración simple, solo embebe una URL externa de streaming provista por el
  rematador. Sin servidor de medios propio ([ADR-005](adr/ADR-005-transmision-en-vivo-fuera-de-alcance-del-mvp.md)).
- Rate limiting básico de ofertas por usuario/conexión.
- Entorno completo levantable con Docker Compose.

## Roadmap futuro (fuera del MVP, explícitamente pospuesto)

Ordenado aproximadamente por qué tan natural es que sea el siguiente paso, no por
prioridad de negocio:

1. **Streaming propio**: ingesta (RTMP/WebRTC), transcodificación, distribución (HLS) y
   eventualmente CDN — reemplaza la integración simple del MVP cuando/si se justifica.
2. **Pagos integrados / escrow** entre comprador ganador y rematador.
3. **Sistema anti-fraude**: detección de shill bidding y patrones de colusión (R-07),
   apoyado en el registro inmutable de ofertas que el MVP ya construye.
4. **Rol de Moderador**: delegar revisión de denuncias sin dar acceso total de
   administrador (ver nota en [02-roles-y-casos-de-uso.md](02-roles-y-casos-de-uso.md)).
5. **Notificaciones multicanal**: push, email, SMS (el MVP solo notifica dentro de la app).
6. **Búsqueda y filtros avanzados** sobre remates/lotes (ej. Elasticsearch), cuando el
   volumen de remates finalizados lo justifique.
7. **Sistema de reputación/calificaciones** entre compradores y rematadores.
8. **Observabilidad avanzada**: tracing distribuido (OpenTelemetry), dashboards (Grafana),
   alerting — el MVP solo deja los boundaries listos para instrumentar (RNF-16).
9. **Autoscaling / Kubernetes**, si el volumen de conexiones concurrentes reales supera
   cómodamente lo que Docker Compose / un par de instancias fijas pueden sostener.
10. **App móvil nativa.**
11. **Internacionalización** (multi-idioma, multi-moneda).
12. **Extracción a microservicios** de módulos puntuales (por ejemplo, Bidding como
    servicio separado) — solo si la escala real lo justifica; ver [ADR-001](adr/ADR-001-modular-monolito-vs-microservicios.md)
    para la razón de por qué no se empieza así.

## Deploy a producción — pendiente, bloqueado por un healthcheck que no pasa

Estado al 2026-08-21: el backend buildea y arranca correctamente tanto en Render como en
Railway (migraciones OK, `uvicorn` escuchando en el puerto correcto, `GET /health` y
`HEAD /health` devuelven 200 verificado con `curl` local contra la imagen real), pero en
ambas plataformas el deploy termina matado por el healthcheck ("service unavailable" /
"1/1 replicas never became healthy") antes de promoverse a producción. Se prueba de
nuevo cuando se retome esta fase — antes de asumir que es el mismo bug ya descartado,
releer esto primero.

Ya descartado (con evidencia, no supuesto):
- Puerto hardcodeado / `$PORT` no resuelto: `docker-entrypoint.sh` arranca `uvicorn`
  resolviendo `${PORT:-10000}` en su propio shell (no depende de cómo Docker combina
  `CMD` con `ENTRYPOINT`, ver commit `ca973e7`). Confirmado con un contenedor corrido
  localmente igual que en producción (sin `command:` override, `PORT` inyectado a un
  valor distinto de 10000): `uvicorn` loguea que arrancó en ese puerto.
- Target port mal configurado en Railway: Settings → Networking lo tiene en 8080,
  coincide con el puerto real.
- El endpoint `/health` en sí (`app/main.py`): es una ruta trivial sin DB/Redis de por
  medio, responde `{"status":"ok"}` a GET y HEAD.
- Que la app se cuelgue o crashee: los logs de Railway muestran `GET /health` → 200
  repetido durante toda la ventana de 5 minutos del healthcheck, no solo al principio.

Lo raro que queda sin explicar: en los deploy logs de Railway, los timestamps de esos
`GET /health` → 200 coinciden casi exactamente con el backoff de reintentos que el propio
banner de Railway reporta como fallidos ("Attempt #1... #11 failed with service
unavailable") — todo indica que son las mismas requests del healthcheck, contestadas
200 por la app, pero igual marcadas como fallidas. Pasa igual en Render, una plataforma
con infraestructura de proxy/healthcheck totalmente distinta, lo que descarta que sea
un problema puntual de la red/edge de Railway.

Próximos pasos sugeridos cuando se retome (no probados todavía):
- Comparar el log crudo de Render (nunca se llegó a revisar en detalle, solo se confirmó
  que falla "igual").
- Probar bindear `uvicorn` a `--host ::` (dual-stack) en vez de `0.0.0.0`, por si el
  healthcheck de alguna de las dos plataformas prueba por IPv6 y el bind actual
  (IPv4-only) lo rechaza silenciosamente mientras otra ruta interna sí llega.
- Probar un healthcheck manual mínimo (imagen `hello-world` HTTP sin toda la app detrás)
  en el mismo servicio de Railway/Render, para aislar si el problema es de la app o de
  cómo estas dos plataformas evalúan el healthcheck en este proyecto puntual.

2026-08-24, dual-stack (probado, no era esto): se agregó `UVICORN_HOST` a
`docker-entrypoint.sh` y se probó `UVICORN_HOST=::` en Railway. El log de arranque
confirmó `Uvicorn running on http://[::]:8080` (dual-stack, puerto correcto) y el
healthcheck siguió fallando igual, las 11 reintentos de la ventana de 5 minutos. Esto
descarta la hipótesis IPv6 -- se deja la variable en el código (default `0.0.0.0`, sin
efecto en Render/local) por si sirve para otra cosa más adelante, pero no se vuelve a
probar por esta razón.

2026-08-24, causa real encontrada y corregida: `RequestContextMiddleware`
(`app/core/middleware.py`) loguea `request_completed` (con `status_code=200`) **antes**
de esperar `RedisMetricsRecorder.record_timing` (la métrica de `avg_api_response_ms`,
Módulo 8.1) — pero con `BaseHTTPMiddleware` la respuesta HTTP real no se termina de
escribir en el socket hasta que `dispatch()` retorna. `build_redis_client`
(`app/redis/client.py`) construía el cliente sin `socket_connect_timeout` ni
`socket_timeout`, así que si `REDIS_URL` no es alcanzable (o tarda) en producción, ese
`await` cuelga sin límite: la app ya "logueó" 200, pero el healthcheck externo (con su
propio timeout) nunca recibe la respuesta y la marca "service unavailable" — exactamente
lo que se veía en los logs de Railway y Render, y por qué pasaba igual en ambas
plataformas (es un bug de la app, no de ninguna de las dos). No era específico de
`/health`: todos los endpoints pagaban este mismo costo oculto.

Fix: `build_redis_client` ahora pasa `socket_connect_timeout=5, socket_timeout=5`
(acota cualquier operación contra Redis en vez de dejarla sin límite), y
`RequestContextMiddleware` ya no espera la métrica in-line -- la dispara con
`asyncio.create_task` (fire-and-forget real, no solo "no rompe el request" vía
`except Exception`, que no alcanza contra un cuelgue). Reproducido en local: un
`redis.exceptions.TimeoutError` real (conexión vieja del pool tras reiniciar el
contenedor de Redis) quedó logueado como advertencia y `/health` igual respondió 200 en
18ms. Falta confirmar que esto destraba el deploy real en Railway.

## Qué NO es roadmap, es explícitamente fuera de alcance del proyecto

- Reemplazar el contacto manual post-remate (pago/entrega) por un flujo transaccional
  propio es una decisión de producto grande (custodia de fondos, disputas, regulación) que
  excede el propósito de portfolio de este proyecto. Si en algún momento se aborda, debe
  tratarse como un proyecto/fase aparte con su propia documentación de riesgos legales y
  financieros, no como un ítem más del roadmap técnico.
