# ADR-032: Dashboard del Rematador — extender `features/remates/` para el recurso, feature nuevo para la experiencia, sin botón "Pausar"

- **Fecha**: 2026-07-27
- **Estado**: Aceptada

## Contexto

Épica 5, Módulo 5.1 pide la consola principal para el rol `rematador`: tarjetas con sus
remates propios, indicadores operativos (lotes, conectados, lote activo/próximo) y
acciones de ciclo de vida (iniciar, reanudar, finalizar), con buscador/filtro/orden y
"apariencia de consola profesional, no un CRUD tradicional". Restricciones explícitas:
cero cambios en `backend/`, cero cambios en la arquitectura del frontend, y no tocar la
Sala del Remate del comprador. El backend del motor de estados
(`docs/16-motor-de-estados.md`, Épica 2.3) ya expone todo lo necesario por HTTP
(`start`/`pause`/`resume`/`finish`, con sus precondiciones ya validadas server-side); este
módulo es enteramente de consumo, no de diseño de negocio nuevo. Cuatro decisiones
quedaron por tomar: cómo organizar el código nuevo respecto a `features/remates/` ya
existente, de dónde sale "compradores conectados", qué hacer ante estados sin ninguna
acción de ciclo de vida disponible en este dashboard, y si incluir o no un botón
"Pausar" pese a que el enunciado no lo pide explícitamente.

## Decisión

### A. Extender `features/remates/api.ts`/`hooks.ts`/`filtering.ts`/`labels.ts` (aditivo), y crear `features/rematador/` solo para la experiencia nueva

Las acciones de ciclo de vida (`start`/`resume`/`finish`) viven en el mismo
`app/modules/remates/router.py` que el resto del CRUD de `Remate` — a diferencia de la
Sala del Remate (ADR-030), que se separó en `features/sala/` porque compone DTOs de un
paquete de backend genuinamente distinto (`app/snapshot/`), acá el propio backend no
traza ningún límite de módulo nuevo entre "ver remates" y "administrar su ciclo de
vida". Por eso las funciones HTTP nuevas
(`startRemateRequest`/`resumeRemateRequest`/`finishRemateRequest`) se agregaron a
`features/remates/api.ts`, `useRemates` ganó un parámetro opcional `ownerId` (en vez de
un hook paralelo), `DashboardToolbar` ganó un prop opcional `statusOptions` (default
`VISIBLE_STATUS_OPTIONS`, sin cambiar el comportamiento para `CompradorDashboardPage`), y
`RemateFilters.status` se ensanchó de `VisibleRemateStatus | 'all'` a
`RemateStatus | 'all'` — los cuatro cambios son aditivos/retrocompatibles, verificados
con la suite completa (`CompradorDashboardPage.test.tsx` sigue pasando sin
modificaciones).

`features/rematador/` sí es un feature nuevo, pero por un motivo distinto: es una
experiencia de producto conceptualmente separada ("administrar mis remates" vs.
"explorar remates ajenos") que va a seguir creciendo en el Módulo 5.2 (Consola
Operativa) sin mezclarse con el dominio de navegación del comprador — mismo argumento de
crecimiento futuro que ADR-030 ya usó para `features/sala/`, aplicado acá al nivel de
página/componentes, no al de llamadas HTTP del recurso.

### B. "Compradores conectados" reusa `fetchRemateSnapshotRequest` de `features/sala/api.ts`, solo para remates `live`/`paused`

No existe otro endpoint que exponga `RoomManager.connection_count` — el snapshot ya lo
calcula (`connected_users`) y ya es invocable por el dueño de un remate en cualquier
estado (`SnapshotService.build` usa el mismo criterio de visibilidad que
`GET /remates/{id}`, no exige `live`). Se reusó la función ya existente en
`features/sala/api.ts` en vez de duplicar la llamada HTTP — mismo criterio de reuso
cruzado entre features que ya practica `features/sala/` al importar `useLotes` de
`features/remates/hooks.ts`. Se limitó la llamada a remates `live`/`paused`: pedirla para
un `draft`/`scheduled`/`finished`/`cancelled` siempre devolvería `0` sin aportar
información real (nadie puede estar conectado por WebSocket a un remate que no está en
curso), así que se prefirió no gastar la request y no mostrar la línea en la tarjeta en
vez de mostrar un "0 conectados" engañoso.

### C. Estados sin acción de ciclo de vida disponible en este dashboard (`draft`, `finished`, `cancelled`) solo muestran "Ver remate"/"Administrar"

Un remate en `draft` necesita programarse (`schedule`) antes de poder iniciarse, y este
módulo no expone esa acción (no estaba en la lista de acciones pedidas). Se decidió no
construirla por completitud no solicitada: el estado vacío/la tarjeta lo documentan
honestamente ("no hay acción disponible acá todavía") en vez de agregar un botón
"Programar" que el enunciado no pidió. Mismo criterio para `finished`/`cancelled`
(estados terminales, sin ninguna transición posible).

### D. Sin botón "Pausar", aunque sí "Reanudar" — decisión deliberada, no un olvido

El enunciado de este módulo lista explícitamente "Iniciar", "Reanudar" y "Finalizar" como
acciones a implementar — "Pausar" no aparece en esa lista. Se evaluó agregarlo de todos
modos (para que un remate `live` tuviera cómo llegar a `paused`, y así justificar por qué
"Reanudar" sería necesario), pero se descartó: pausar es una acción de **control en
vivo** — se hace mientras se está operando el remate en tiempo real, viendo ofertas
entrar — que corresponde a la Consola Operativa del Rematador (Módulo 5.2, explícitamente
el "siguiente módulo" que este mismo enunciado pide preparar), no a una consola de
repaso/administración general como esta. "Reanudar" sí se mantuvo en este dashboard
porque cumple un propósito distinto y con sentido acá: retomar un remate que quedó
pausado en una sesión anterior (por ejemplo, tras cerrar el navegador) sin tener que
abrir la Consola Operativa solo para eso — un caso de uso de "repaso", no de "control en
vivo".

## Alternativas consideradas

- **Un `features/rematador/api.ts` propio, con sus propias copias de `startRemateRequest`
  etc.**: descartado por la sección A — duplicaría llamadas HTTP sobre el mismo recurso
  que ya administra `features/remates/api.ts`, sin ningún límite de módulo del backend
  que lo justifique.
- **Un hook `useMyRemates` paralelo a `useRemates`**: descartado por la sección A —
  habría duplicado toda la lógica de paginación "hasta juntar el total" que `useRemates`
  ya tenía, por una única diferencia (`owner_id`) resoluble con un parámetro opcional.
- **Pedir el snapshot para todos los remates, sin importar el estado**: descartado por
  la sección B — información sin valor real (`0` garantizado) a cambio de una request
  extra por tarjeta, en cada carga del dashboard.
- **Agregar un botón "Programar" para borradores, y "Cancelar" para cualquier estado no
  terminal**: descartado por la sección C — no estaban en la lista de acciones pedidas;
  agregarlos habría sido una interpretación expansiva de un enunciado que ya fue
  explícito sobre qué acciones quería.
- **Agregar "Pausar" para que "Reanudar" tuviera un origen dentro de este mismo
  dashboard**: descartado por la sección D — el enunciado ya distinguía implícitamente
  entre esta consola (repaso) y la Consola Operativa (control en vivo, módulo
  siguiente); forzar "Pausar" acá habría anticipado una pantalla que el propio enunciado
  pide dejar para después.

## Consecuencias

- **Ventajas**: cero duplicación de lógica ya construida (`useRemates`,
  `DashboardToolbar`, `filterAndSortRemates`, el snapshot); `features/rematador/` queda
  libre para crecer en el Módulo 5.2 sin arrastrar el dominio de navegación del
  comprador; primer uso real de `useToastStore` (existía desde la fundación del
  frontend sin consumidores) da feedback profesional a cada acción; la ruta
  `/remates/:remateId/gestionar` y el patrón `runAction` + toast + `onChanged` quedan
  listos para que el Módulo 5.2 los extienda sin rediseñar nada.
- **Desventajas aceptadas**: un remate en `draft` no tiene, todavía, ninguna forma de
  llegar a `scheduled` desde el frontend (documentado, no oculto); "conectados" no se
  actualiza en vivo dentro de este dashboard (es una foto del momento del último
  `reload`, no un WebSocket); "próximo lote" puede no resolverse en un remate con más de
  50 lotes (extremadamente inusual en la práctica, y el conteo total sigue siendo
  exacto igual).
- El día que se implemente la Consola Operativa del Rematador (Módulo 5.2), el trabajo
  es reemplazar `GestionRematePlaceholderPage` y agregar "Pausar"/"Cancelar" ahí — ninguna
  decisión de este ADR necesita revisarse para eso.
