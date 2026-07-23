# RematAR -- Pruebas de carga y rendimiento (Épica 8, Módulo 8.2)

Entorno de pruebas de carga **separado del backend/frontend**: es un cliente
independiente que habla con RematAR únicamente por HTTP/WebSocket, igual que
cualquier navegador. No importa nada de `backend/app`, no toca la base de datos
directamente, y tiene su propio `pyproject.toml`/entorno virtual.

Ver [`docs/39-pruebas-de-carga-y-rendimiento.md`](../docs/39-pruebas-de-carga-y-rendimiento.md)
para el diseño completo (qué mide cada escenario, de dónde sale cada métrica, cómo
interpretar un reporte) y [ADR-042](../docs/adr/ADR-042-pruebas-de-carga-y-rendimiento.md)
para por qué se eligió esta arquitectura (asyncio propio en vez de Locust/k6).

## 1. Requisitos previos

1. El stack de RematAR corriendo (`docker compose up` desde la raíz del repo) --
   backend, PostgreSQL y Redis.
2. Un administrador bootstrapeado (`docker compose exec backend python -m
   app.scripts.create_superuser`, ya documentado en el README raíz) -- lo usa el
   poller de `GET /monitoring/metrics` para enriquecer los reportes con CPU/memoria/
   conectados del servidor. **No es obligatorio**: si el login de admin falla (u
   omitís `--admin-email`/`--admin-password`), la corrida sigue igual, solo sin esa
   serie temporal de métricas de servidor en el reporte.
3. Python 3.13+.

## 2. Instalación (entorno virtual propio, separado del backend)

```bash
cd loadtest
python -m venv .venv
# Windows:
.venv\Scripts\pip install -e ".[dev]"
# Linux/Mac:
.venv/bin/pip install -e ".[dev]"
```

## 3. Cómo correr un escenario

Formato general:

```bash
python -m loadtest run <escenario> [--host http://localhost:8000] [flags del escenario]
```

Cada corrida imprime dónde quedaron `summary.json` (datos crudos) y `report.html`
(reporte visual autocontenido -- abrilo directo con doble click, no necesita
servidor) bajo `loadtest/results/<escenario>_<timestamp>/`.

### 3.1 Compradores conectados (100 / 500 / 1000) -- RNF-04

```bash
python -m loadtest run connected_buyers --num-buyers 100 --ramp-up-seconds 15 --hold-seconds 60
python -m loadtest run connected_buyers --num-buyers 500 --ramp-up-seconds 30 --hold-seconds 60
python -m loadtest run connected_buyers --num-buyers 1000 --ramp-up-seconds 60 --hold-seconds 60
```

Qué esperar: tasa de conexión exitosa cercana al 100%, tiempo de conexión (p95) que
no crece significativamente entre 100 y 1000, y `active_websockets`/`connected_users`
del servidor reflejando exactamente el número pedido durante el `hold`.

### 3.2 Múltiples remates simultáneos -- RNF-06

```bash
python -m loadtest run concurrent_remates --num-remates 10 --buyers-per-remate 50 --ramp-up-seconds 30 --hold-seconds 60
```

Qué esperar: el costo de tener N remates `LIVE` en paralelo (cada uno con su propia
sala) no debería degradar la latencia de conexión frente a `connected_buyers` con el
mismo total de compradores en una sola sala.

### 3.3 Miles de ofertas consecutivas -- stress del Auction Engine

```bash
python -m loadtest run bid_storm --num-buyers 200 --duration-seconds 30 --think-time-ms 100
```

Qué esperar: la mayoría de las ofertas se **rechazan** -- solo una puede ser la
vigente en cada instante (ADR-004). Eso es correcto, no un error. Lo que sí importa:
cero inconsistencias (nunca dos ofertas "vigentes" contradictorias, RNF-09) y la
latencia de la ida y vuelta (`ofertas.client_perceived`) cerca del objetivo de RNF-02
(150ms p95).

### 3.4 Chat con alta concurrencia

```bash
python -m loadtest run chat_concurrency --num-buyers 150 --senders-fraction 0.3 --duration-seconds 40 --message-interval-seconds 3
```

Qué esperar: una fracción de los mensajes en `429` (rate limiting, 5 mensajes/10s por
usuario, `docs/34-chat-del-remate.md`) -- comportamiento correcto bajo ráfaga, no una
falla. `websocket.messages_per_second` es el broadcast real que reciben todos los
conectados.

### 3.5 Notificaciones en tiempo real (latencia de difusión) -- RNF-01

```bash
python -m loadtest run notifications_broadcast --num-buyers 200 --ramp-up-seconds 20 --num-rounds 30 --round-interval-seconds 1.0
```

Qué esperar: `broadcast.client_perceived.p95_ms` por debajo de 300ms (RNF-01) bajo
carga nominal. Es la métrica más directamente ligada a un requisito no funcional
explícito del proyecto.

## 4. Cómo leer un reporte (`report.html`)

- **Resumen ejecutivo**: KPIs de un vistazo (throughput, p95 de las latencias clave,
  errores).
- **Recomendaciones**: reglas básicas contra los umbrales de
  `docs/04-requisitos-no-funcionales.md` -- si algo las dispara, indica qué mirar
  primero (no es un diagnóstico definitivo).
- **Tablas de latencia HTTP por tipo de llamada** y **WebSocket**.
- **Gráficos**: latencia en el tiempo, throughput, CPU/memoria y conexiones activas
  reportadas por el servidor (vía `GET /monitoring/metrics`, si el login de admin
  funcionó).
- **Muestra de errores**: hasta 50 errores textuales si algo falló.

## 5. Comparar varias corridas

Útil para responder "¿cómo escaló entre 100, 500 y 1000 compradores?":

```bash
python -m loadtest compare \
  results/connected_buyers_20260722-100000/summary.json \
  results/connected_buyers_20260722-100500/summary.json \
  results/connected_buyers_20260722-101000/summary.json
```

Genera `results/comparison_<timestamp>/comparison.html` con una tabla y gráficos de
barras lado a lado.

## 6. Notas operativas

- Las credenciales de los compradores/rematador sintéticos se cachean en
  `.cache/credentials-<host>.json` (gitignored) -- corridas repetidas no vuelven a
  pagar el costo de registro (hashing Argon2), solo el login.
- Todos los emails sintéticos usan el dominio `rematar.io` (no `.local`/`.test`):
  `email-validator` (Pydantic `EmailStr`, usado por el backend) rechaza TLDs
  reservados por IANA.
- Los remates/lotes creados por cada corrida quedan en la base -- son datos de
  prueba reales (misma API pública), no se limpian automáticamente. Si el volumen
  molesta en un entorno compartido, usar una base descartable.
- `loadtest/tests/` corre con `pytest` y cubre solo lógica pura (percentiles, motor
  de recomendaciones) -- la verificación real de un escenario es correrlo contra un
  backend de verdad, no hay forma de simular eso en un test unitario.
