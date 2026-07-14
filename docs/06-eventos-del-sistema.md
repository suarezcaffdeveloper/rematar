# 06 — Eventos del Sistema

Catálogo de eventos de dominio, agrupados por agregado. Convención de nombre:
`dominio.evento` en pasado. Estos eventos cumplen doble función:

1. Son lo que se **difunde por WebSocket** a los clientes conectados a un remate.
2. Son, internamente, **eventos de dominio** que otros módulos (notificaciones, auditoría)
   pueden escuchar sin acoplarse al módulo que los origina — el módulo de bidding no debería
   necesitar saber que existen notificaciones para poder aceptar una oferta.

Esto no implica un bus de mensajería distribuido ni event sourcing completo: dentro del
monolito modular (ver [ADR-001](adr/ADR-001-modular-monolito-vs-microservicios.md)) alcanza
con un mecanismo de eventos internos in-process, y `remate.*`/`lote.*` que cruzan a otros
clientes se difunden además vía Redis Pub/Sub.

## Remate

| Evento | Disparado por | Payload conceptual |
|---|---|---|
| `remate.creado` | Rematador crea remate | remate_id, rematador_id |
| `remate.programado` | Rematador fija fecha | remate_id, fecha |
| `remate.iniciado` | Rematador inicia remate | remate_id, timestamp |
| `remate.pausado` | Rematador pausa remate | remate_id, motivo? |
| `remate.reanudado` | Rematador reanuda remate | remate_id |
| `remate.finalizado` | Se cierra el último lote, o el rematador lo finaliza manualmente | remate_id |
| `remate.cancelado` | Rematador cancela | remate_id, motivo |

## Lote

| Evento | Disparado por | Payload conceptual |
|---|---|---|
| `lote.abierto` | Rematador abre el lote | lote_id, remate_id, precio_inicial, incremento_minimo |
| `lote.oferta_aceptada` | Comprador oferta válidamente | lote_id, oferta_id, usuario_id, monto |
| `lote.oferta_rechazada` | Comprador oferta inválidamente | lote_id, usuario_id, motivo (solo al emisor, no se difunde) |
| `lote.cierre_extendido` | Anti-sniping dispara extensión | lote_id, nuevo_cierre_estimado |
| `lote.cerrado` | Rematador cierra el lote, o vence timer | lote_id, resultado (`SOLD`/`UNSOLD`) |
| `lote.ganador_determinado` | Sistema, inmediatamente tras `lote.cerrado` con resultado `SOLD` | lote_id, oferta_ganadora_id, usuario_id, monto |
| `lote.cancelado` | Rematador cancela un lote puntual | lote_id, motivo |

## Oferta

Nota: las ofertas no tienen eventos propios separados de los de `lote.*` de arriba — una
oferta aceptada **es** `lote.oferta_aceptada`, y su transición a "superada" no genera un
evento nuevo, es una consecuencia derivada (ver [07-maquinas-de-estado.md](07-maquinas-de-estado.md)).
Modelarlo así evita duplicar el mismo hecho de negocio bajo dos nombres distintos.

## Usuario / Conexión (presencia, no crítico)

| Evento | Disparado por | Payload conceptual | Consistencia |
|---|---|---|---|
| `presencia.usuario_conectado` | Cliente abre WS a un remate | remate_id, usuario_id (o anónimo) | Eventually consistent |
| `presencia.usuario_desconectado` | Cliente cierra/pierde WS | remate_id, usuario_id | Eventually consistent |
| `seguimiento.remate_seguido` | Comprador sigue un remate | remate_id, usuario_id | — |

## Notas de diseño

- **Los eventos de presencia son de mejor esfuerzo, no fuente de verdad.** Un contador de
  "viewers" que se desincroniza por unos segundos tras una desconexión abrupta no es un
  bug crítico; una oferta mal aceptada sí lo es. Por eso los tratamos con niveles de
  consistencia distintos (ver [RNF-09/RNF-10](04-requisitos-no-funcionales.md)).
- **`lote.oferta_rechazada` nunca se difunde a otros clientes**, solo se devuelve a quien
  la emitió — de lo contrario cualquier conectado vería los intentos fallidos ajenos, lo
  cual no aporta valor y filtra información innecesaria (por ejemuplo, cuánto intentó
  ofertar alguien y no le alcanzó).
- Todo evento que cruza al cliente por WebSocket debe ser versionable (incluir un campo de
  versión de esquema del mensaje) para poder evolucionar el protocolo sin romper clientes
  viejos conectados durante un despliegue.
