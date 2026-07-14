# 10 — Diagramas

## Diagrama de módulos (componentes)

```mermaid
graph TD
    subgraph Cliente
        FE[Frontend React/Vite]
    end

    subgraph Edge
        LB[Balanceador de carga]
    end

    subgraph Backend["Backend FastAPI (multiples instancias, sin estado en memoria compartido)"]
        AUTH[Modulo Auth]
        REMATES[Modulo Remates y Lotes]
        BIDDING[Modulo Bidding]
        RT[Modulo Realtime / Conexiones WS]
        NOTIF[Modulo Notificaciones]
        STREAM[Modulo Streaming-integration]
    end

    subgraph Datos
        PG[(PostgreSQL: fuente de verdad)]
        REDIS[(Redis: Pub/Sub, cache, rate limiting, presencia)]
    end

    EXT[Servicio externo de streaming, provisto por el rematador]

    FE -->|HTTPS REST: login, CRUD remates/lotes, historial| LB
    FE -->|WSS: conexion en tiempo real por remate| LB
    LB --> AUTH
    LB --> REMATES
    LB --> RT

    RT --> BIDDING
    BIDDING --> PG
    BIDDING --> REDIS
    REMATES --> PG
    AUTH --> PG
    NOTIF --> REDIS
    NOTIF --> PG
    STREAM --> REMATES

    REDIS -.->|fan-out entre instancias| RT

    FE -.->|embed URL externa| EXT
    STREAM -.->|solo resuelve la URL, no procesa video| EXT
```

**Puntos a resaltar del diagrama:**

- El frontend habla dos protocolos con el mismo backend: REST para operaciones CRUD/consulta
  y WebSocket para todo lo que es tiempo real (bidding, eventos de lote/remate).
- `Realtime/Conexiones` es el único módulo que mantiene conexiones abiertas; delega la
  lógica de negocio de una oferta al módulo `Bidding` — no valida reglas de negocio él
  mismo, solo transporta mensajes.
- Redis conecta todas las instancias del backend entre sí (fan-out), no conecta el backend
  con el frontend directamente.
- El módulo de streaming es intencionalmente delgado: no hay una caja de "servidor de
  medios" en este diagrama porque no existe en el MVP (ver [ADR-005](adr/ADR-005-transmision-en-vivo-fuera-de-alcance-del-mvp.md)).

## Diagrama del flujo principal del negocio

Ver [05-flujo-de-negocio.md](05-flujo-de-negocio.md) para el flowchart completo del ciclo
de vida de un remate y el diagrama de secuencia detallado de una oferta en tiempo real —
se mantienen ahí junto con la narrativa para no duplicar contenido que se desincronice.
