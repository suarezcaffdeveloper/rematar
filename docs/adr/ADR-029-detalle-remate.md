# ADR-029: Página de detalle del remate — rematador sin nombre real mostrado honestamente, dos hooks de carga independientes, sala en su propia ruta

- **Fecha**: 2026-07-24
- **Estado**: Aceptada

## Contexto

Épica 4, Módulo 4.4 pide la página que un comprador ve antes de "entrar" a un remate:
toda su información (incluido, esta vez sí, el rematador) más el listado de lotes, con
un botón "Entrar al remate" que por ahora va a un placeholder. Mismo backend que el
dashboard (Módulo 4.3, [ADR-028](ADR-028-dashboard-comprador.md)) — mismo hueco de
"no hay forma de resolver `owner_id` a un nombre" — pero esta vez el enunciado pide
explícitamente mostrar "Rematador" como campo mínimo, a diferencia del dashboard donde
era opcional ("si tiene sentido mostrarlo"). Además, esta página reemplaza a
`RemateDetailPlaceholderPage` (la ruta `/remates/:remateId` que el Módulo 4.3 dejaba
como destino temporal de "Ver remate"), así que hay que decidir dónde queda el
placeholder de la sala, que todavía tiene que existir.

## Decisión

### A. "Rematador verificado" + fragmento del id, no omitir el campo ni inventar un nombre

Sin `GET /users/{id}` para un comprador (mismo hueco que ADR-028), no hay forma de
mostrar un nombre real sin tocar el backend, prohibido en esta fase. A diferencia del
dashboard (que omite el campo entero porque ahí era opcional), acá el enunciado lo pide
como mínimo explícito — omitirlo sin más incumpliría el pedido. La resolución es
honesta en vez de forzada: `RemateInfoSection` muestra "Rematador verificado" (una
etiqueta genérica, sin inventar un nombre que no existe) junto con un fragmento corto y
monoespaciado del `owner_id` (8 caracteres), suficiente para que dos remates de
rematadores distintos se vean visualmente diferenciables sin pretender ser un nombre de
persona. Es preferible a mostrar el UUID completo (ruido) o a un campo vacío/oculto
(incumple el pedido). La solución de fondo sigue siendo la misma que en ADR-028: un
endpoint de backend para un perfil público mínimo, documentado como trabajo futuro.

### B. `useRemateDetail` y `useLotes` como hooks independientes, no uno combinado

El remate y sus lotes son dos requests con posibilidades de fallo independientes entre
sí. Combinarlos en un solo hook (`useRemateAndLotes`) obligaría a decidir qué hacer si
uno falla y el otro no — probablemente ocultar todo detrás de un único estado de error,
perdiendo información del remate que sí cargó bien. Con dos hooks separados,
`RemateDetailPage` compone dos estados de carga/error independientes: si
`GET /remates/{id}/lotes` falla, el header y el panel de información (que ya
resolvieron) se quedan en pantalla, y solo la sección de lotes muestra su propio
`Alert` con su propio botón de reintento. Mismo patrón que ya usa el dashboard
(Módulo 4.3) entre `useRemates` y `useLoteCount` por tarjeta — coherencia entre ambos
módulos del feature.

### C. La sala placeholder pasa a su propia ruta (`/remates/:remateId/sala`)

El Módulo 4.3 había puesto `RemateDetailPlaceholderPage` en `/remates/:remateId` como
destino temporal de "Ver remate", documentando explícitamente que sería reemplazado.
Este módulo lo reemplaza: `/remates/:remateId` pasa a ser la página de detalle real, y
el placeholder de la sala (que sigue haciendo falta, porque "Entrar al remate" todavía
no tiene una sala real a la que ir) se mueve a `/remates/:remateId/sala` — una ruta
propia, no anidada dentro del detalle. El archivo se renombra a
`SalaPlaceholderPage.tsx` para que el nombre siga describiendo lo que hace. Se
descartó mantenerlo en la misma ruta que el detalle (por ejemplo, como un estado
interno de `RemateDetailPage`) porque la sala en vivo es, conceptualmente, una pantalla
distinta con su propio ciclo de vida (conexión WebSocket, sala de Room Manager) — darle
una URL propia desde ahora evita una migración de rutas el día que la sala real exista.

### D. `CoverPlaceholder` se extrae de `RemateCard` a un componente compartido del feature

`RemateCard` (Módulo 4.3) tenía su propio `CoverPlaceholder` local, no exportado. Este
módulo lo necesita en dos lugares más (`RemateDetailHeader`, `LoteCard`) con una
pequeña variación (el ícono: martillo para un remate, caja para un lote). En vez de
triplicar el componente, se extrae a `features/remates/components/CoverPlaceholder.tsx`
con un `icon` prop opcional, y `RemateCard` se actualiza para importarlo — incidental a
este módulo pero mínimo (una función movida, mismo JSX, mismos tests de `RemateCard`
sin cambios y sin dejar de pasar).

## Alternativas consideradas

- **Mostrar el UUID completo del rematador**: descartado — ruido sin significado para
  un comprador, peor que un fragmento corto con una etiqueta clara.
- **Ocultar por completo la sección "Rematador"** (mismo criterio que el dashboard):
  descartado porque el enunciado de este módulo, a diferencia del anterior, lo pide
  como campo mínimo explícito.
- **Un solo hook combinado para remate + lotes**: descartado por la sección B — pierde
  la posibilidad de mostrar el remate igual si solo los lotes fallan.
- **Sala placeholder anidada dentro de la página de detalle** (por ejemplo, un modal o
  una sección que se expande): descartado por la sección C — la sala en vivo es una
  pantalla con su propio ciclo de vida, no una variante visual del detalle.

## Consecuencias

- **Ventajas**: la página de detalle sigue siendo útil aunque el listado de lotes
  falle momentáneamente; "Rematador" cumple el pedido del enunciado sin fabricar datos
  que el backend no tiene; la ruta de la sala ya existe y ya es el destino real de
  "Entrar al remate", lista para que un módulo futuro reemplace únicamente
  `SalaPlaceholderPage` sin tocar el árbol de rutas ni la página de detalle.
- **Desventajas aceptadas**: el fragmento de `owner_id` mostrado como "identidad" del
  rematador no es información verdaderamente útil para un comprador (no puede buscar
  por ese fragmento, no es memorable) — es honesto pero no resuelve el problema de
  fondo, que sigue siendo un endpoint de backend pendiente.
- El día que el backend exponga un perfil público del rematador, el cambio es local a
  `RemateInfoSection` (reemplazar el fragmento de id por el nombre real) y, si
  aplicara, a `RemateCard` del dashboard (que hoy omite el campo por completo) —
  ninguna decisión de este ADR necesita revisarse para eso.
