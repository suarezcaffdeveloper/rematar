# k6 — pruebas de carga HTTP-only

## Alcance de esta carpeta (y por qué existe además de `loadtest/`)

RematAR ya tenía, antes de este módulo, una herramienta de carga propia en
`loadtest/` (Épica 8, Módulo 8.2 — ver `docs/39-pruebas-de-carga-y-rendimiento.md` y
[ADR-042](../docs/adr/ADR-042-pruebas-de-carga-y-rendimiento.md)). Esa decisión
evaluó k6 explícitamente y lo descartó **para WebSocket/bidding**: el protocolo del
Gateway (`docs/20-gateway-websocket.md`) es a medida (auth en el primer mensaje,
heartbeat aplicativo, `join_room`) y el soporte de WebSocket de k6 es limitado para
eso, mientras que `loadtest/` ya lo reimplementa completo y correlaciona cada corrida
con `GET /monitoring/metrics` del servidor en el mismo reporte.

Esta carpeta (`k6/`) cubre lo que `loadtest/` **no** hace y donde k6 sí es la
herramienta más simple: escenarios **HTTP puros**, sin WebSocket — navegación de
visitantes, listados/detalles de remates y lotes, login, operaciones administrativas
no destructivas. Nunca reimplementa bidding ni conexión WS; para eso, correr
`loadtest/`.

| Necesito probar... | Herramienta |
|---|---|
| Navegación anónima/autenticada, listados, detalles (sin WS) | `k6/` (esta carpeta) |
| Pujas, conexión WebSocket, chat en tiempo real, difusión de eventos | `loadtest/` |
| Flujo real de navegador (login visual, sala en vivo, actualizaciones en tiempo real) | `frontend/e2e/` (Playwright) |

## Requisitos

- k6 instalado (`k6 version` — ya verificado en esta máquina: v2.0.0).
- El stack local levantado: `docker compose up -d` desde la raíz del repo.
- Nunca apuntar `BASE_URL` a un entorno que no sea local/de pruebas.

## Estructura

```
k6/
├── lib/
│   ├── config.js       Config compartida (BASE_URL, credenciales admin, prefijo de datos sintéticos)
│   └── thresholds.js    Umbrales derivados de docs/04-requisitos-no-funcionales.md
├── scenarios/            Un script por escenario (Fase 5 en adelante)
└── results/               Salida de cada corrida (gitignored, igual que loadtest/results/)
```

## Escenarios (Fase 5)

| Archivo | Persona | Flujo |
|---|---|---|
| `scenarios/visitors.js` | Visitante anónimo | listado remates → detalle → listado lotes → detalle lote → oferta vigente |
| `scenarios/buyers.js` | Comprador | + login, y con probabilidad configurable (`BID_PROBABILITY`, default 0.3) ofertar sobre el lote fixture (HTTP puro — `POST .../ofertas` no es WebSocket) |
| `scenarios/companies.js` | Empresa | dashboard de remates propios → detalle → lotes → analítica en vivo → auditoría |
| `scenarios/auctioneers.js` | Martillero (`rematador`) | remates asignados → detalle → lotes → estado completo (snapshot). Deliberadamente sin pausar/cerrar el lote fixture — ver comentario en el archivo. |

Antes de correr cualquiera, sembrar el fixture una vez con `k6 run smoke-test.js`
(o dejar que el propio `setup()` de cada escenario lo haga solo).

## Cómo correr un escenario

```bash
cd k6
k6 run -e BASE_URL=http://localhost:8000 scenarios/visitors.js

# Override de carga sin tocar el archivo (k6 ignora options.scenarios cuando se pasan
# --vus/--duration por CLI):
k6 run --vus 50 --duration 1m scenarios/buyers.js
k6 run -e NUM_BUYERS=100 --vus 100 --duration 2m scenarios/buyers.js
```

Los escenarios de progresión/stress/spike/soak (Fases 7-10) reutilizan estos mismos
archivos con distintos perfiles de carga, no se reescriben desde cero.
