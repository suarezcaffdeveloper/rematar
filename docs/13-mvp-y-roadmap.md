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

## Qué NO es roadmap, es explícitamente fuera de alcance del proyecto

- Reemplazar el contacto manual post-remate (pago/entrega) por un flujo transaccional
  propio es una decisión de producto grande (custodia de fondos, disputas, regulación) que
  excede el propósito de portfolio de este proyecto. Si en algún momento se aborda, debe
  tratarse como un proyecto/fase aparte con su propia documentación de riesgos legales y
  financieros, no como un ítem más del roadmap técnico.
