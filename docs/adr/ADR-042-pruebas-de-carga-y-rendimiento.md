# ADR-042: Pruebas de Carga y Rendimiento — herramienta propia en asyncio, separada del backend/frontend, reutiliza `GET /monitoring/metrics`

- **Fecha**: 2026-07-22
- **Estado**: Aceptada

## Contexto

El enunciado pide un entorno completo de pruebas de carga para simular cientos o
miles de compradores conectados, múltiples remates simultáneos, miles de ofertas
consecutivas, chat de alta concurrencia y notificaciones en tiempo real -- y medir el
comportamiento del sistema mientras tanto. Dos restricciones explícitas del enunciado
condicionan toda la decisión: **cero funcionalidad de negocio nueva** (esto es
puramente infraestructura de testing, igual que el Módulo 8.1 lo fue de
observabilidad) y **mantener las herramientas de testing separadas del código
principal**.

## Decisión

### A. Herramienta propia en `asyncio`, no Locust ni k6

Se evaluaron tres caminos:

1. **Locust** (Python, el más usado para carga HTTP): su modelo de ejecución nativo
   son *greenlets* de `gevent`, no `asyncio` -- soportar WebSocket con el protocolo
   propio del Gateway (auth en el primer mensaje, heartbeat aplicativo, `join_room`,
   ver `docs/20-gateway-websocket.md`) exige monkey-patching de `gevent` o un cliente
   WS de terceros adaptado a ese modelo, fricción real para un protocolo hecho a
   medida. Además, correlacionar cada medición con `GET /monitoring/metrics` del
   servidor en el mismo reporte requeriría un plugin custom de todas formas.
2. **k6** (Go/JavaScript): introduce un segundo lenguaje al proyecto solo para esta
   fase (el resto del proyecto es Python + TypeScript), y su soporte de WebSocket es
   más limitado que el de HTTP -- mismo problema de fondo que Locust para este caso
   puntual.
3. **Script propio en `asyncio` + `httpx` + `websockets`** (elegido): mismo lenguaje
   que el backend, sin adaptar ningún modelo de concurrencia ajeno. Un único proceso
   Python sostiene cómodamente miles de conexiones WebSocket concurrentes (I/O-bound),
   que es exactamente el techo pedido por el enunciado (100/500/1000 compradores) --
   la complejidad de un runner distribuido (maestro/workers) de Locust no se
   justifica para esa escala. Permite reimplementar el protocolo exacto del Gateway
   sin adaptadores y leer `GET /monitoring/metrics` con el mismo cliente HTTP que
   genera la carga, en el mismo reporte.

### B. Directorio top-level separado (`loadtest/`), con su propio `pyproject.toml`

Mismo criterio que el enunciado pide explícitamente ("mantener separadas las
herramientas de testing del código principal"): `loadtest/` es hermano de
`backend/`/`frontend/`, con su propio entorno virtual y dependencias
(`httpx`/`websockets`/`matplotlib`/`jinja2`) que **no** se agregan al
`pyproject.toml` del backend. No importa un solo símbolo de `backend/app` -- habla con
RematAR únicamente por HTTP/WebSocket, exactamente como lo haría un navegador o
cualquier cliente externo real. Esa reimplementación independiente del protocolo
(en vez de reusar los modelos Pydantic de `app/websocket/messages.py`) es, de hecho,
la prueba más honesta de que el protocolo documentado en `docs/20` funciona: si este
cliente tuviera que importar código del backend para funcionar, el protocolo no
estaría realmente desacoplado del transporte que lo implementa.

### C. Cero endpoints nuevos: se reutiliza `GET /monitoring/metrics` (Módulo 8.1)

El Módulo 8.1 ya expone conectados/WebSockets activos, timings promedio de oferta y
de API, errores recientes, memoria y CPU del proceso -- exactamente las métricas de
servidor que este módulo necesita. En vez de instrumentar nada nuevo en el backend, un
`MonitoringPoller` (`loadtest/metrics.py`) sondea ese endpoint ya existente cada
pocos segundos durante una corrida y vuelca las lecturas en el mismo reporte que las
métricas medidas por el cliente. Esto mantiene el principio de "cero cambios en el
backend" mientras aprovecha una inversión ya hecha (y documentada, ADR-041) en vez de
duplicarla.

El polling requiere un token de administrador (`GET /monitoring/metrics` es
admin-only por diseño, ADR-041 sección B) -- se reutiliza el admin ya bootstrapeado
por `app/scripts/create_superuser.py`, sin agregar ningún mecanismo de autenticación
nuevo. Si ese login falla (credenciales incorrectas, admin no bootstrapeado en el
entorno contra el que se corre), la corrida **sigue igual**, solo sin esa serie
temporal de métricas de servidor -- mismo criterio best-effort que el propio
`RedisMetricsRecorder` del Módulo 8.1 ya aplica a sus propios fallos.

### D. Seed de datos exclusivamente vía la API pública, nunca acceso directo a la base

`loadtest/identity.py`/`fixtures.py` registran compradores/rematador y crean
remates/lotes `LIVE`+`OPEN` llamando a los mismos endpoints que usaría un usuario real
(`POST /auth/register`, `.../remates`, `.../schedule`, `.../start`, `.../lotes/{id}/open`).
Se descartó leer/escribir la base directamente: mantiene la herramienta utilizable
contra cualquier entorno corriendo (no solo uno con acceso directo a Postgres), y
ejercita el mismo camino que cualquier carga real recorrería.

### E. Reportes: `matplotlib` (Agg) + `jinja2`, HTML autocontenido

Se generan gráficos como PNG embebidos en base64 dentro de un único `report.html` --
se abre con doble click, sin servidor ni conexión a internet (sin CDN de gráficos
JS). `jinja2` se agregó como única dependencia "de más" sobre lo estrictamente
necesario porque el HTML de un reporte con secciones repetidas (tablas, gráficos)
como texto concatenado a mano es frágil de mantener; el costo (una dependencia chica,
sin tocar el árbol del backend) se consideró bajo frente al beneficio.

## Alternativas consideradas

- **Locust**: descartada, ver sección A -- fricción real de `gevent` para WebSocket
  con protocolo propio.
- **k6**: descartada, ver sección A -- segundo lenguaje solo para esta fase, soporte
  de WebSocket más limitado.
- **Instrumentar métricas de servidor nuevas en el backend** en vez de reutilizar
  `GET /monitoring/metrics`: descartada, ver sección C -- duplicaría trabajo ya hecho
  y documentado en el Módulo 8.1, violando además "cero funcionalidad de negocio
  nueva" del enunciado de este módulo.
- **Acceso directo a Postgres para sembrar datos de prueba**: descartada, ver sección D
  -- ataría la herramienta a un entorno con acceso a la base, y no ejercitaría el
  mismo camino que un usuario real.
- **Vivir dentro de `backend/tests/`** en vez de un directorio top-level propio:
  descartada -- el enunciado pide explícitamente separar el tooling de testing del
  código principal, y `backend/tests/` es la suite de tests del propio backend
  (pytest, corre en CI contra el código de `app/`), un propósito distinto al de un
  generador de carga externo con sus propias dependencias pesadas (`matplotlib`).

## Consecuencias

- **Ventajas**: cero cambios en `backend/app`/`frontend/src`; el protocolo WebSocket
  documentado (`docs/20`) queda validado por un cliente independiente que no comparte
  código con el servidor; las métricas de servidor se obtienen sin instrumentación
  nueva, reutilizando el Módulo 8.1; el entorno completo (dependencias, venv,
  resultados) vive aislado en `loadtest/`, sin ensuciar el árbol de dependencias del
  backend.
- **Desventajas aceptadas**: un único proceso Python no escala tan lejos como un
  runner distribuido tipo Locust si en el futuro se necesitaran decenas de miles de
  conexiones simultáneas (fuera del alcance pedido, 100-1000); los datos de prueba
  (remates/lotes/usuarios sintéticos) creados por cada corrida no se limpian
  automáticamente; las métricas de servidor son best-effort y dependen de que el
  admin esté bootstrapeado.
- Escalar esta herramienta a un runner distribuido (si el volumen a simular creciera
  muy por encima de miles de conexiones) sería agregar un modo de coordinación entre
  varios procesos `loadtest`, no reescribir los escenarios ni el protocolo del cliente
  WebSocket ya construido.
