# Pruebas de carga, estrés y concurrencia — guía operativa

Este documento es la guía de uso de las tres herramientas de carga/estrés/concurrencia/
e2e del proyecto: **cuándo** usar cada una, **cómo** instalarlas, generar datos de
prueba, ejecutar cada tipo de test, e interpretar los resultados. Complementa a
[39-pruebas-de-carga-y-rendimiento.md](39-pruebas-de-carga-y-rendimiento.md) (que
documenta el diseño interno de `loadtest/` en profundidad) y a
[ADR-042](adr/ADR-042-pruebas-de-carga-y-rendimiento.md) (por qué `loadtest/` es una
herramienta propia en `asyncio` y no k6/Locust) — no repite ese contenido, lo referencia.

## Por qué tres herramientas, no una

| Herramienta | Cubre | Por qué |
|---|---|---|
| **`k6/`** | HTTP puro: navegación, login, listados, detalle, pujas ocasionales | k6 es el estándar de la industria para carga HTTP, con miles de VUs livianos y umbrales (`thresholds`) declarativos |
| **`loadtest/`** | WebSocket, conexión a la sala, concurrencia de pujas sobre un mismo lote, chat, notificaciones en tiempo real | El protocolo del Gateway WebSocket es a medida (auth en el primer mensaje, heartbeat, `join_room` — [docs/20](20-gateway-websocket.md)); el soporte de WS de k6 es limitado para eso. Ver [ADR-042](adr/ADR-042-pruebas-de-carga-y-rendimiento.md) para la comparación completa (se evaluó k6 y Locust, se descartaron ambos para este caso). Reutiliza `GET /monitoring/metrics` del servidor en el mismo reporte que sus propias métricas de cliente. |
| **`frontend/e2e/`** (Playwright) | Verificación de que un navegador real (no un cliente simulado) puede loguearse, entrar a la sala, ofertar, y recibir actualizaciones en tiempo real — bajo carga controlada de las otras dos | Nunca reemplaza a k6/`loadtest/` para *generar* carga — solo confirma que un humano real puede hacer lo que la carga simulada dice que puede hacer. |

Ninguna de las tres accede nunca directo a Postgres/Redis: todas hablan con RematAR
únicamente por HTTP/WebSocket, exactamente como lo haría un cliente externo real (mismo
criterio en las tres, ver ADR-042 sección D).

## Instalación

Las tres asumen el stack local levantado (`docker compose up -d` desde la raíz) y nunca
apuntan a otro entorno por defecto — nunca correr ninguna contra producción.

```bash
# k6 -- binario standalone, nada que instalar en el proyecto
k6 version   # si falta: https://k6.io/docs/get-started/installation/

# loadtest/ -- venv propio, dependencias propias (no toca las del backend)
cd loadtest
python -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"      # Linux/Mac: .venv/bin/pip

# Playwright -- ya es devDependency del frontend
cd frontend
npm install
npx playwright install chromium webkit        # una sola vez, descarga los navegadores
```

## Datos de prueba (identificación, nunca usuarios reales)

Mismo dominio (`rematar.io`, no es un TLD reservado — email-validator rechaza `.local`/
`.test`) y un prefijo por herramienta en el local-part del email, para que cualquier
cuenta sintética se distinga a simple vista de una real en la base o en Adminer:

| Prefijo | Herramienta | Ejemplo |
|---|---|---|
| `loadtest-` | `loadtest/` | `loadtest-buyer-00001@rematar.io` |
| `k6-` | `k6/` | `k6-buyer-00001@rematar.io`, `k6-empresa@rematar.io`, `k6-rematador@rematar.io` |
| `pw-` | reservado para specs nuevos de Playwright | — (los specs actuales reutilizan las cuentas `k6-*` ya sembradas) |

Los cuatro roles del enunciado se mapean a los roles reales del sistema (ver
[docs/02](02-roles-y-casos-de-uso.md), [ADR-047](adr/ADR-047-redefinicion-de-roles-empresa-rematador.md)
si existe, o el histórico de roles): visitante = sin cuenta (lectura anónima, ADR-049),
comprador = `comprador`, empresa = `empresa` (dueña comercial), martillero = `rematador`
(opera un remate que la empresa le asignó por código, ADR-048).

**Generar los datos**: `k6 run k6/smoke-test.js` siembra de punta a punta (empresa +
martillero + un comprador + el remate/lote fixture `"K6 Remate Demo"` LIVE+OPEN,
asignación de operador incluida) contra el host que le pases con `-e BASE_URL=...`.
Cualquier escenario de `k6/scenarios/` y de `loadtest/` también siembra lo que necesita
solo, vía su propio `setup()`/`ensure_*` — no hace falta correr el smoke test antes a
propósito, es solo la forma más rápida de sembrar todo de una vez.

A diferencia de `loadtest/fixtures.py` (crea un remate **nuevo** por corrida, título
único por UUID — necesario para aislar escenarios como `bid_storm`), `k6/lib/fixtures.js`
**reutiliza** el mismo remate/lote fixture entre corridas (busca por título antes de
crear) — los escenarios de k6 son de lectura repetida, no tiene sentido inflar la tabla
de remates en cada ejecución.

## Estructura de los scripts

```
k6/
├── lib/                    config.js, identity.js, fixtures.js, thresholds.js, util.js
├── scenarios/
│   ├── visitors.js          Escenario A -- navegación 100% anónima
│   ├── buyers.js             Escenario B -- login + navegación + pujas ocasionales
│   ├── companies.js          Escenario C -- dashboard/analítica/auditoría de la empresa
│   ├── auctioneers.js        Escenario D -- remates asignados del martillero
│   └── spike.js               Fase 9 -- perfil de carga en punta (50→500→1000→2000→50)
├── smoke-test.js            Verificación de 1 iteración de que el entorno está sembrado
└── results/                  Salida de cada corrida (gitignored)

loadtest/
├── loadtest/
│   ├── config.py, identity.py, fixtures.py, client_http.py, client_ws.py, metrics.py
│   ├── integrity.py          Fase 6 -- verificación de integridad post-bid_storm
│   ├── report.py, compare.py, charting.py, cli.py
│   └── scenarios/
│       ├── connected_buyers.py    N compradores conectados (RNF-04)
│       ├── concurrent_remates.py   Múltiples remates simultáneos (RNF-06)
│       ├── bid_storm.py             Miles de ofertas + verificación de integridad
│       ├── chat_concurrency.py     Chat con alta concurrencia
│       └── notifications_broadcast.py  Latencia de difusión en tiempo real (RNF-01)
├── db-backups/                Backups de Postgres tomados antes de una corrida (gitignored)
└── results/                    summary.json + report.html por corrida (gitignored)

frontend/
├── playwright.config.ts
└── e2e/
    ├── support/fixture.ts      Reutiliza el fixture de k6/lib/fixtures.js vía la API
    ├── login.spec.ts
    └── sala-realtime-bidding.spec.ts
```

## Cómo ejecutar cada escenario (Fase 5)

```bash
# k6 -- HTTP puro
cd k6
k6 run scenarios/visitors.js
k6 run scenarios/buyers.js
k6 run scenarios/companies.js
k6 run scenarios/auctioneers.js

# loadtest -- WebSocket / bidding
cd loadtest
./.venv/Scripts/python -m loadtest run connected_buyers --num-buyers 100
./.venv/Scripts/python -m loadtest run concurrent_remates --num-remates 5
./.venv/Scripts/python -m loadtest run chat_concurrency
./.venv/Scripts/python -m loadtest run notifications_broadcast

# Playwright -- flujo real de navegador
cd frontend
npm run test:e2e
```

## Concurrencia de pujas (Fase 6 — la prueba más importante)

```bash
cd loadtest
./.venv/Scripts/python -m loadtest run bid_storm --num-buyers 50 --duration-seconds 5 --think-time-ms 0
./.venv/Scripts/python -m loadtest run bid_storm --num-buyers 100 --duration-seconds 5 --think-time-ms 0
```

Después de cada corrida, `loadtest/loadtest/integrity.py` lee el historial completo de
ofertas por la API y verifica (no solo códigos HTTP): exactamente un ganador vigente,
que coincida con `GET .../ofertas/leading`, sin IDs duplicados, y que la secuencia real
de "quién iba ganando" respete el incremento mínimo en cada salto. La consola imprime un
bloque `INTEGRIDAD DE DATOS: OK/FALLÓ` al final de la corrida; el detalle completo
(`accepted_count`, `winner_amount`, `issues`) queda en `extra.integrity` de
`summary.json`.

**Nota de diseño no obvia**: la secuencia real de ofertas **no** se puede reconstruir
ordenando por `created_at` — esa columna usa `server_default=func.now()`
([app/db/mixins.py](../backend/app/db/mixins.py)) y `now()` de Postgres se fija al
*inicio* de la transacción, no al momento del INSERT. Bajo contención real del lock de
fila de [ADR-004](adr/ADR-004-concurrencia-en-determinacion-de-ganador.md), una
transacción puede "empezar" antes que otra pero insertar después (esperando el lock),
así que ordenar por `created_at` puede mostrar una secuencia que parece un incremento
inválido sin serlo. `integrity.py` reconstruye la cadena real emparejando
`oferta_vieja.updated_at == oferta_nueva.created_at` (mismo `now()`, misma transacción).

## Progresivo / stress test (Fases 7-8)

No son escenarios nuevos: son los mismos `scenarios/buyers.js` y `connected_buyers`
corridos con distintos niveles de carga.

```bash
# k6 -- override de carga sin tocar el archivo (k6 ignora options.scenarios si le pasás --vus/--duration)
cd k6
k6 run --vus 10  --duration 25s scenarios/buyers.js
k6 run --vus 100 --duration 25s scenarios/buyers.js
k6 run --vus 500 --duration 25s scenarios/buyers.js
k6 run -e NUM_BUYERS=100 --vus 1000 --duration 25s scenarios/buyers.js

# loadtest -- flags propios del escenario
cd loadtest
./.venv/Scripts/python -m loadtest run connected_buyers --num-buyers 500 --ramp-up-seconds 280 --hold-seconds 30
```

**El ramp-up de WebSocket importa, no es un detalle cosmético**: `WS_IP_CONNECT_RATE_LIMIT_MAX=20`
conexiones nuevas por IP cada `WS_IP_CONNECT_RATE_LIMIT_WINDOW_SECONDS=10`
([app/core/config.py](../backend/app/core/config.py)) — desde una sola máquina de carga
(una sola IP), pedir cientos de conexiones sin espaciar el `--ramp-up-seconds` dispara
ese límite y se ve como "el sistema falla" cuando en realidad es el rate limiter
funcionando como está documentado. Regla práctica: `ramp_up_seconds >= num_buyers / 1.8`.

## Spike test (Fase 9)

Perfil de carga en punta (subida abrupta, no progresiva) — necesita `stages` explícitos
en el archivo, no se puede lograr solo con `--vus`/`--duration`:

```bash
cd k6
k6 run -e NUM_BUYERS=150 --out json=results/spike_raw.json scenarios/spike.js
```

`--out json=...` es necesario para poder analizar la recuperación **después** de que la
carga vuelve a un nivel bajo (el resumen final de k6 agrega todo el rango, no separa
"antes/durante/después"). Bucketear el JSON crudo por ventana de tiempo (`data.time` de
cada punto `http_req_duration`/`http_req_failed`) es la única forma de ver si el sistema
realmente se recuperó o solo dejó de generarse carga nueva.

## Soak test (Fase 10)

Carga **sostenible** (confirmada sana en el progresivo, no en el límite) durante 30-60
minutos — el objetivo es aislar "¿se degrada con el tiempo?" de "¿se degrada con exceso
de carga?" (eso ya lo cubre el stress test). Correr a un nivel donde ya sabés que el
error rate es 0%:

```bash
cd k6
k6 run -e NUM_BUYERS=50 --vus 50 --duration 30m --out json=results/soak_raw.json scenarios/buyers.js
```

En paralelo, muestrear el servidor (fuera de k6, que no expone esto):

```bash
# cada minuto, en otra terminal
docker stats --no-stream --format "{{.CPUPerc}} {{.MemUsage}}" rematar-backend-1
docker compose exec db psql -U rematar -d rematar -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='rematar';"
```

Buscar: memoria que crece sin bajar entre ventanas (fuga), conexiones a Postgres que
suben con el tiempo (fuga de sesiones), o latencia p95 que se arrastra hacia arriba
ventana a ventana (degradación progresiva) — no solo el promedio final.

## Cómo interpretar los resultados

- **`loadtest/`**: abrir `results/<escenario>_<timestamp>/report.html` (autocontenido,
  doble click, sin servidor) — resumen ejecutivo, recomendaciones automáticas basadas en
  los thresholds de abajo, gráficos, tabla de latencia HTTP/WS, muestra de errores.
  `summary.json` es la fuente de datos cruda (`loadtest compare` arma un
  `comparison.html` a partir de varios).
- **`k6/`**: la consola imprime el resumen al final (`checks`, `http_req_duration`,
  `http_req_failed`, y cualquier threshold declarado con ✓/✗). `--summary-export
  archivo.json` guarda el mismo resumen como JSON; `--out json=archivo.json` guarda
  **cada punto individual** (necesario solo para análisis por ventana de tiempo, como en
  el spike test).
- **Mirar p95, nunca el promedio** — un promedio bajo puede esconder una cola larga real.
  RNF-01/RNF-02 ([docs/04](04-requisitos-no-funcionales.md)) están expresados en p95 a
  propósito.
- **Un error rate alto en `bid_storm` no es necesariamente un problema** — la mayoría de
  las ofertas rechazadas son el comportamiento correcto del Auction Engine (solo una
  puede ser la vigente). Mirar `extra.integrity.passed`, no solo la tasa de error cruda.
- **`http_req_failed` de k6 cuenta cualquier status ≥400** — un `409` esperado de un
  registro idempotente (`register-or-login`) ensucia ese número salvo que se marque
  explícitamente como esperado con `responseCallback: http.expectedStatuses(201, 409)`
  (ver `k6/lib/identity.js`) — sin eso, un threshold de error rate puede fallar por una
  corrida repetida que reutiliza cuentas ya creadas, no por una falla real.

## Thresholds utilizados

| Threshold | Valor | Origen |
|---|---|---|
| p95 de una oferta (RNF-02) | < 150ms | [docs/04](04-requisitos-no-funcionales.md) |
| p95 de difusión en tiempo real (RNF-01) | < 300ms | [docs/04](04-requisitos-no-funcionales.md) |
| p95 de un endpoint de lectura genérico | < 500ms | conservador, acorde a RNF-03 (las lecturas no deberían competir con el bidding) |
| Tasa de error tolerada | < 2% | mismo criterio que la recomendación de `loadtest/report.py` |
| WebSockets concurrentes (objetivo de diseño) | ≥ 2000, multi-instancia | RNF-04 |

`k6/lib/thresholds.js` y `loadtest/loadtest/report.py:build_recommendations` son la
fuente única de estos valores — no se repiten hardcodeados en cada escenario.

## Limitaciones conocidas

- **Los datos de prueba no se limpian automáticamente** (mismo criterio en las tres
  herramientas) — en un entorno compartido, usar una base descartable, o respaldar antes
  con `pg_dump` (ver `loadtest/db-backups/`, gitignored).
- **El techo de ~960 conexiones WebSocket medido desde el host es un artefacto del
  entorno de desarrollo, no de la aplicación.** Confirmado corriendo la misma prueba
  desde *dentro* de la red de Docker (contenedor a contenedor, sin pasar por el proxy de
  red que Docker Desktop usa en Windows para publicar el puerto): 500/500 conexiones
  exitosas con 21.7ms de latencia, contra 442/500 y 3.6 segundos por el mismo test desde
  el host. Para un número de techo real (RNF-04), medir contra un entorno Linux real
  (Railway, WSL2 directo, cualquier VM), nunca contra Docker Desktop/Windows.
- **El rate limiting de la app puede confundirse con una falla del sistema** si no se
  parametriza el generador de carga con cuidado — ver la nota de `--ramp-up-seconds` más
  arriba, y `k6/lib/identity.js`/`responseCallback` para el caso de `auth/register`.
  Ejecutar varias corridas de debugging seguidas contra la misma cuenta puede agotar
  `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` (10/900s) — se resuelve borrando la clave puntual en
  Redis (`DEL login:<email>`), nunca deshabilitando el rate limit en sí.
- **Multi-worker (`--workers`, producción únicamente) reduce a la mitad el pool de
  conexiones a Postgres por proceso (`DB_POOL_SIZE=7`/`DB_MAX_OVERFLOW=10`, antes
  20/30) — margen ajustado, no generoso.** Se probó primero con los valores de un solo
  proceso sin cambiar: Postgres (`max_connections=100` por defecto) devolvió `"sorry,
  too many clients already"` y **cortó el acceso a la base para todo el stack**, no solo
  para la instancia bajo prueba. Con el pool reducido, una corrida de 500 VUs llegó a
  94/100 conexiones en el pico -- pasa, pero sin mucho margen para herramientas de
  administración u otra carga concurrente real. Si se necesita más colchón, la palanca
  es subir `max_connections` en la instancia de Postgres de producción (Neon/Railway),
  no seguir bajando el pool de la app.
- **El contador de "conectados" que ve el usuario en la sala se subcuenta con
  multi-worker** (`RoomManager.connection_count`, en memoria por proceso) — cosmético,
  no participa de la determinación del ganador de un lote. El techo de
  `WS_MAX_CONNECTIONS_PER_USER` también se relaja a `× cantidad_de_workers` -- ambas ya
  documentadas como degradación aceptable en `app/websocket/rate_limit.py` antes de esta
  fase. Un registro distribuido de presencia en Redis (sorted-set con heartbeat +
  limpieza) resolvería las dos, pero queda como trabajo futuro aparte, no bloqueante.
- **Un único proceso de carga no escala a decenas de miles de conexiones simultáneas**
  (`loadtest/`, ver ADR-042) — suficiente para el techo pedido (cientos/miles), no
  pensado para más sin un modo distribuido.

## Qué se encontró y qué se corrigió (resumen — Fases 13-14)

Diagnóstico completo, con evidencia (no solo la sospecha) en cada punto:

1. **CPU saturado en un solo proceso, confirmado que no es la base de datos**: bajo una
   carga que dejó al backend en 216.79% de CPU, Postgres estaba en 6.63% y Redis en
   1.32%. Se descartó `--reload` con una prueba A/B real (segundo backend idéntico sin
   `--reload`, misma carga: CPU y latencia prácticamente idénticos). **Corregido**:
   `orjson` como serializador por defecto (`backend/app/core/responses.py`),
   `--limit-concurrency 2000`, y `--workers` en producción (`backend/docker-entrypoint.sh`).
   Con 4 workers, la misma prueba de 500 VUs de la Fase 7/8 pasó de 61.3 a 120.0 req/s
   (+96%), p95 de 8528ms a 2900ms (menos de la mitad), y la tasa de error bajó de 5.9% a
   4.0% (no subió). El primer intento (4 workers con el pool de conexiones de un solo
   proceso sin ajustar) tumbó el acceso a Postgres para todo el stack -- ver la
   limitación de "multi-worker reduce el pool" más abajo, es la corrección que lo evitó
   en el segundo intento. Se verificó también que ningún consumidor de eventos duplica
   efectos secundarios entre workers (mensajes de sistema del chat, casos post-remate,
   cierre de lote) -- ya protegidos con constraints únicos y el lock de fila de ADR-004,
   sin necesitar ningún cambio de código para eso.
2. **Recuperación lenta post-spike (75-90s)**: sin ningún mecanismo de descarte de carga,
   el proceso encolaba cada request en vez de rechazar rápido lo que ya no podía atender.
   **Corregido**: con `--limit-concurrency`, el mismo spike test se recupera en ~45-60s,
   y el tipo de falla durante la ventana de recuperación cambió de timeouts de 60s a
   rechazos de ~200ms.
3. **Techo de ~960 WebSockets**: revisado como limitación del entorno de desarrollo
   (Docker Desktop/Windows), no de la aplicación — ver limitación de arriba. Sin
   corrección de código.
4. **Lock de fila del Auction Engine ([ADR-004](adr/ADR-004-concurrencia-en-determinacion-de-ganador.md))**:
   confirmado que **no** es un cuello de botella propio — su lentitud bajo carga extrema
   se explica enteramente por el punto 1. Integridad de datos verificada al 100% en dos
   corridas de concurrencia de pujas (50 y 100 compradores).
