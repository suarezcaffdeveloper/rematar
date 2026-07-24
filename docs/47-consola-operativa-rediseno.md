# 47 — Consola Operativa del Rematador (Rediseño Integral de UI/UX, Etapa 5)

Referencia rápida de la Etapa 5 del rediseño de UI/UX. Sin cambios de lógica de
negocio, WebSockets ni servicios: `useLiveRemateState` y todos los endpoints que la
página consume siguen siendo los mismos.

## El problema que se resolvía

La Consola era un apilado de 5-6 cards a lo ancho completo: cabecera, lote+ofertas (en
grid solo desde `lg:`), próximos lotes, chat, moderación, analítica -- en ese orden. Un
rematador operando un remate en vivo tenía que hacer scroll más allá del chat y la
moderación para llegar a la analítica, y el panel de control (las acciones que más usa)
quedaba un scroll completo por debajo de la cabecera.

## `shared/components/Tabs.tsx` (nuevo)

Extraído del patrón que `AdminAuditLogPage.tsx` ya usaba a mano desde la Épica 7.2
(`role="tablist"`, subrayado en la pestaña activa) -- mismo look, ahora reutilizable.
Solo dibuja la lista de pestañas; el contenido de cada una lo decide quien lo usa.
`AdminAuditLogPage` migra a este componente en la Etapa 6 (todavía usa su copia local
por ahora, para no mezclar un refactor de una pantalla que no le toca a esta etapa).

## `ConsolaSidebar.tsx` (nuevo) -- reemplaza el apilado de Chat/Moderación

Mismo mecanismo de `useWideLayout` que la Sala (Etapa 4): la página pide un `<main>`
más ancho y arma un grid `xl:grid-cols-[1fr_380px]`. A diferencia de la Sala (que apila
Chat+Ofertas sin pestañas porque son solo dos secciones, ambas "siempre a la vista"), la
Consola tiene cuatro -- Chat, Ofertas, Conectados, Moderación -- y la mayoría son de uso
ocasional (moderar, revisar conectados) más que algo que hace falta ver todo el tiempo
como el chat en la Sala. Pestañas evitan que las cuatro compitan por el mismo espacio
angosto sin agregar un scroll de página.

**Decisión de diseño**: "Conectados" reusa `ConnectedBuyersList` (Moderación -- nombre,
búsqueda, silenciar/expulsar) en vez del `ConnectedUsersList` genérico y anonimizado
que existía antes en esta pantalla (eliminado, junto con `ModerationPanel.tsx`, que
quedó sin ningún consumidor). El enunciado pide explícitamente "compradores
conectados", no cualquier conexión -- la versión de Moderación ya cubre exactamente eso
con más capacidad, mantener las dos hubiera sido duplicar la misma idea con menos
funcionalidad en una de ellas. El `reloadToken`/la suscripción a eventos de moderación
que antes vivían dentro de `ModerationPanel` se movieron a `ConsolaSidebar`, que ahora
alimenta dos pestañas (Conectados y Moderación) en vez de una sola.

**Límite conocido**: cada pestaña monta/desmonta su contenido al cambiar (no hay un
`display: none` que las mantenga vivas) -- volver a la pestaña de Chat después de ver
Ofertas recarga el historial de mensajes desde cero. Aceptado por ahora (mismo
comportamiento que tendría cualquier tab genérico); si se vuelve un problema real, la
solución es montar las cuatro y ocultar con CSS en vez de condicional, sin tocar la API
del componente.

## `ConsolaLotePanel.tsx` / `ConsolaControlPanel.tsx`

Mismo tratamiento que `ActiveLotePanel` en la Sala (Etapa 4): precio + cuenta regresiva
en una zona de acción destacada, antes de la descripción/ficha técnica (sin botón de
ofertar acá -- eso es exclusivo del comprador). `ConsolaControlPanel` agrupa sus seis
botones en dos filas con encabezado ("Lote" / "Remate") en vez de una única fila de
seis botones sueltos -- mismos handlers, misma lógica de habilitado/deshabilitado, sin
ningún cambio de comportamiento.

## Verificación

`tsc -b` limpio, suite completa de frontend (632 tests) en verde, `vite build` exitoso.
Dos tests de `ConsolaOperativaPage` que asumían el `ConnectedUsersList` genérico se
reemplazaron; la cobertura del cambio de pestañas en detalle vive en
`ConsolaSidebar.test.tsx` (nuevo).
