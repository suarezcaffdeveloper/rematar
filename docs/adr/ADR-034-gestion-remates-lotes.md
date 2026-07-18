# ADR-034: Gestión completa de Remates y Lotes — consolidación de "programar"/"publicar", duplicar compuesto en el cliente, y reordenamiento con fallback obligatorio

- **Fecha**: 2026-07-29
- **Estado**: Aceptada

## Contexto

Épica 5, Módulo 5.3 pide la interfaz donde el rematador prepara un remate completo antes
de que empiece: crear/editar/eliminar/duplicar/programar/publicar/cancelar un remate, y
dentro de él crear/editar/eliminar/duplicar/reordenar (drag & drop) sus lotes.
Restricciones explícitas: cero cambios en `backend/`, no modificar la arquitectura del
frontend, sin tablas tradicionales (tarjetas, sidebar, modales), sin chat/streaming/
notificaciones. Cuatro decisiones de diseño no quedaban resueltas por el enunciado ni por
el backend existente:

1. El pedido lista "Programar remate" y "Publicar remate" como dos acciones separadas,
   pero el motor de estados (`docs/16-motor-de-estados.md`) solo tiene **una** transición
   de `draft` a `scheduled` (`POST /remates/{id}/schedule`) — no hay dos endpoints ni dos
   estados intermedios distintos.
2. Ningún endpoint de "duplicar" existe para `Remate` ni para `Lote` (`docs/14-modulo-
   remate.md`, `docs/15-modulo-lote.md` solo documentan CRUD + reordenamiento).
3. El pedido exige drag & drop para reordenar lotes, "manteniendo el árbol de
   dependencias liviano" (criterio ya establecido en ADR-027).
4. El pedido lista "Peso" e "Información técnica" como campos editables del lote, y
   "Estado" como parte de los "campos editables" — pero `Lote` no tiene una columna
   `peso` (solo `attributes: JSONB`, ADR-014) y el backend no expone ninguna transición
   de estado de lote vía `PATCH` mientras el remate está `draft`/`scheduled` (todo lote
   nuevo nace `pending` y solo cambia vía el motor de estados de la Épica 2.3, que no
   aplica todavía porque el remate ni empezó).

## Decisión

### A. "Programar" y "Publicar" se consolidan en una sola acción: "Publicar remate"

Se interpretó que el enunciado describe la misma operación de negocio con dos nombres
coloquiales (uno más formal — "programar" — y uno más orientado a producto — "publicar"),
no dos transiciones distintas. `RematadorRemateCard` y `RemateManagementSidebar` exponen
un único botón/ítem de menú "Publicar remate" que llama a `scheduleRemateRequest`
(`POST /remates/{id}/schedule`, ya existente), deshabilitado salvo `status === 'draft'`
y con `starts_at` cargado (misma precondición que el backend ya exige). Agregar dos
botones para una única llamada HTTP hubiera sido confuso para el usuario ("¿cuál hago
primero?") sin ningún beneficio real.

### B. Duplicar Remate y Lote se compone en el cliente con GET + POST, sin endpoint nuevo

Sin tocar el backend, "Duplicar" no puede ser una única llamada. `features/rematador/
duplication.ts` implementa:

- `duplicateRemate(source)`: crea un `Remate` nuevo en `draft` con
  `title: "${source.title} (copia)"`, `starts_at`/`ends_at` limpiados a `null`
  (una copia programada para las mismas fechas del original probablemente ya pasadas o en
  conflicto no tiene sentido — el rematador reprograma explícitamente), mismo
  `category`/`description`/`location`/`settings`; luego pide los lotes del origen
  (`GET /remates/{id}/lotes`) y los recrea uno por uno en el remate nuevo, en el mismo
  orden.
- `duplicateLote(remateId, source, existingLotNumbers)`: crea un `Lote` nuevo con el
  mismo contenido, generando un `lot_number` único vía sufijos `-copia`, `-copia-2`, ...
  (truncado a 20 caracteres, el límite de columna) para no chocar con el índice único de
  `(remate_id, lot_number)` (`docs/15-modulo-lote.md`) — el backend rechaza duplicados a
  nivel de base de datos, no hay chequeo Pydantic que evitar de antemano del lado del
  servidor, así que el cliente arma un candidato garantizado único antes de enviarlo.

Ambas funciones son async y secuenciales (no `Promise.all`) para lotes: preservar el
orden de exhibición importa más que la velocidad al duplicar (la cantidad típica de
lotes de un remate de este dominio, decenas, no cientos, hace la diferencia
imperceptible).

**Hallazgo verificado en vivo**: la primera versión pedía los lotes del origen con
`page_size=300` en una sola llamada, asumiendo que alcanzaba para traerlos todos. El
backend limita `page_size` a 100 (`Query(..., le=100)`,
`backend/app/modules/remates/lotes/router.py`) -- cualquier valor mayor devuelve un 422
antes de ejecutar la consulta, así que "Duplicar remate" fallaba el 100% de las veces
(con cualquier cantidad de lotes) y dejaba un `DRAFT` "(copia)" vacío y huérfano ya
creado. Se corrigió pidiendo `page_size=100` (el tope real) y paginando (`fetchAllLotes`)
mientras `total` indique que faltan lotes -- ver `docs/31-gestion-remates-lotes.md`,
"Hallazgo verificado en vivo", para el detalle completo.

### C. Reordenamiento: HTML5 Drag and Drop nativo, con botones ↑/↓ como fallback obligatorio (no cosmético)

Se descartó agregar una librería (`@dnd-kit`, `react-beautiful-dnd`) a favor de la API
nativa de Drag and Drop del navegador (`draggable`, `onDragStart/Enter/Over/Drop/End`),
manteniendo el árbol de dependencias sin cambios (mismo criterio de ADR-027). La
actualización es **optimista**: `persistReorder` reordena el estado local
inmediatamente, llama a `reorderLotesRequest` (`PATCH /remates/{id}/lotes/reorder`, ya
existente) y revierte al orden anterior si la request falla, mostrando el error por
toast.

La API nativa de HTML5 Drag and Drop **no funciona en pantallas táctiles** — ningún
navegador móvil la implementa para elementos arbitrarios. Por eso `LoteManagementCard`
incluye botones ↑/↓ (`onMoveUp`/`onMoveDown`) que llaman al mismo `persistReorder`: no es
un agregado cosmético ni un "nice to have" de accesibilidad, es el **único** mecanismo de
reordenamiento disponible en mobile, por teclado, o con un lector de pantalla. Ambos
caminos comparten la misma función de persistencia (optimista + revert-on-error), así
que no hay dos lógicas de reordenamiento que mantener sincronizadas.

### D. Nuevos componentes compartidos, genéricos y sin estado de dominio

El pedido exige modales, tarjetas y componentes reutilizables en vez de tablas. Se
agregaron a `shared/components/` (no a `features/rematador/`, porque no conocen nada del
dominio Remate/Lote): `Modal` (via `createPortal` a `document.body`, cierre con Escape/
click afuera, bloqueo de scroll), `ConfirmModal` (construido sobre `Modal`, para
"Eliminar remate"/"Eliminar lote"), `Textarea`/`Select` (mismo patrón que `Input.tsx`,
label + control + error), y `DropdownMenu` (menú "⋯" de acciones por tarjeta, cierre con
Escape/click afuera/selección). Los formularios de Remate y Lote (`RemateFormModal`,
`LoteFormModal`) son cada uno un único componente reutilizado tanto para crear como para
editar (`lote`/`remate` presente o ausente en las props decide el modo) — evita
duplicar el layout del formulario entre "Crear" y "Editar".

### E. "Peso" como campo dedicado dentro de `attributes`; "Estado" del lote no editable

`Lote.attributes` es JSONB de forma libre (ADR-014) — no hay una columna `peso`. El
formulario de lote (`loteForm.ts`) trata `attributes.peso_kg` como un campo de primera
clase con su propio input numérico ("Peso (kg)"), separado del editor dinámico de pares
clave/valor de "Información técnica" — así el rematador no edita la misma clave (`peso_kg`)
por dos caminos distintos a la vez (una vez en el campo dedicado, otra vez si además
la agregara como fila dinámica).

"Estado" se muestra como un `Badge` de solo lectura en `LoteFormModal` cuando se edita un
lote existente, pero no es un campo del formulario: mientras el remate está `draft`/
`scheduled` (única condición bajo la que la estructura de lotes es editable,
`LoteService._assert_structure_editable`), todo lote está siempre en `pending` — no hay
ninguna transición que el rematador pueda disparar desde acá, y agregar un selector que
solo tuviera una opción posible hubiera sido confuso.

## Alternativas consideradas

- **Dos botones separados "Programar" y "Publicar"**: descartado — no existen dos
  transiciones de backend distintas que respaldarlos; hubiera sido una distinción
  puramente de producto sin ninguna diferencia funcional, confusa para el usuario.
- **Pedir al backend un endpoint `POST .../duplicate`**: descartado de entrada por la
  restricción explícita "no modificar el backend" — y de todos modos la composición
  cliente-side (GET + POST secuencial) es suficientemente simple y ya reutiliza
  infraestructura existente (`fetchLotesRequest`, `createLoteRequest`).
- **Usar `Promise.all` para duplicar lotes en paralelo**: descartado — el orden de
  exhibición (`display_order`) depende del orden de creación server-side; crear en
  paralelo introduciría una condición de carrera sobre ese orden sin ningún beneficio de
  performance perceptible para la cantidad de lotes típica del dominio.
- **Agregar `@dnd-kit` (o similar) para el reordenamiento**: descartado — el árbol de
  dependencias se mantiene liviano (ADR-027), y la API nativa alcanza para el caso de
  uso (una lista plana, un solo nivel, sin sub-listas anidadas); a cambio, se acepta
  escribir manualmente el manejo de `dragOver`/`dragEnd` en vez de que una librería lo
  resuelva.
- **Tratar los botones ↑/↓ como un fallback secundario/oculto** (por ejemplo, detrás de
  un menú): descartado — HTML5 DnD no funciona en absoluto en touch, así que ocultar el
  único mecanismo de reordenamiento funcional en mobile detrás de un clic adicional
  degradaría la experiencia justo para ese caso de uso.
- **Exponer "Estado" como un selector deshabilitado (una sola opción, `pending`)**:
  descartado — un control interactivo que nunca puede cambiar de valor es peor affordance
  que un badge informativo; el badge comunica lo mismo sin sugerir falsamente que hay
  algo para elegir.

## Consecuencias

- **Ventajas**: una sola acción de publicación sin ambigüedad; duplicar remates/lotes
  sin ningún cambio de backend, reusando exclusivamente endpoints ya existentes y ya
  probados; reordenamiento accesible desde el primer día (mouse, touch vía botones,
  teclado) sin agregar una dependencia nueva; componentes de UI (`Modal`/`ConfirmModal`/
  `Textarea`/`Select`/`DropdownMenu`) genéricos y reutilizables por cualquier módulo
  futuro que necesite un formulario o una confirmación, no atados a Remate/Lote.
- **Desventajas aceptadas**: duplicar un remate con muchos lotes hace tantas llamadas
  `POST` secuenciales como lotes tenga (sin `Promise.all`) — aceptable para el volumen
  típico de este dominio (decenas de lotes, no miles); si un futuro caso de uso necesitara
  duplicar remates con cientos de lotes, valdría la pena revisar esta decisión. El drag &
  drop nativo tiene una superficie de personalización visual más limitada que una
  librería dedicada (por ejemplo, no hay una animación de reordenamiento suave
  "out of the box") — se aceptó a cambio de no sumar una dependencia.
- El día que el backend exponga un endpoint de duplicación real, `duplication.ts` puede
  reemplazarse por una única llamada sin que ningún componente que lo consume (`Rematador
  RemateCard`, `RemateManagementSidebar`, `LoteManagementCard`) necesite cambiar su propia
  interfaz — ya reciben `onDuplicate`/`handleDuplicate` como una operación async opaca.
