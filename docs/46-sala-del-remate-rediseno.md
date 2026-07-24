# 46 — Sala del Remate (Rediseño Integral de UI/UX, Etapa 4)

Referencia rápida de la Etapa 4 del rediseño de UI/UX -- la pantalla más importante del
sistema según el enunciado. Sin cambios de lógica de negocio, WebSockets ni servicios:
`useLiveRemateState`, el reducer de eventos, y todos los componentes de presentación
siguen recibiendo exactamente los mismos props ya resueltos que antes.

## El problema que se resolvía

La Sala (y su gemela, la Consola Operativa, todavía sin rediseñar) era un único `flex
flex-col` de secciones apiladas a lo ancho completo: cabecera, lote activo + ofertas
(en grid solo desde `lg:`), próximos lotes, y el chat al final de todo -- con una altura
fija (`h-[32rem]`). Nada se veía "sin desplazarse", que es exactamente lo que pedía el
enunciado.

## `useWideLayout` (nuevo, `app/layouts/`)

`AppLayout` capea todo el contenido a `max-w-5xl` (1024px) por default -- insuficiente
para un layout de columna principal + sidebar fijo. Mismo patrón que `useBreadcrumb`
(Etapa 2): un store Zustand mínimo (`layoutPreferencesStore.ts`) que la página setea al
montar vía `useWideLayout()` y limpia al desmontar; `AppLayout` lee `isWide` y cambia el
`max-w` de su `<main>` a `max-w-[90rem]` (1440px) mientras esa página está montada.
Reutilizable por cualquier pantalla futura que lo necesite (la Consola Operativa, Etapa
5, es la próxima candidata).

## Layout nuevo de `SalaPage.tsx`

Desde `xl:` (1280px), grid de dos columnas -- por debajo, se apila en una sola columna
como ya hacía antes (fallback responsive sin cambios de comportamiento):

- **Columna principal**: `ActiveLotePanel` (lote activo) o el `EmptyState` de siempre si
  no hay lote abierto.
- **Sidebar** (`xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)]`): ofertas recientes arriba
  (`shrink-0`, con su propio scroll interno si no entran todas) + chat ocupando el
  resto (`flex-1 min-h-0`). Apiladas, no en tabs -- "Chat lateral" e "Historial de
  ofertas" son dos pedidos separados del enunciado; tabs esconderían uno mientras se ve
  el otro.

`ChatPanel` ganó un `className` opcional (default `h-[32rem]`, sin cambios para la
Consola Operativa que todavía lo usa apilado a ancho completo) para poder pasarle
`h-full`/`flex-1` desde el sidebar nuevo. `OfferHistoryPanel` ganó `max-h-72
overflow-y-auto` en su lista de ofertas recientes -- mejora también para su uso actual
en la Consola Operativa, no solo para el sidebar nuevo.

## `ActiveLotePanel` -- zona de acción destacada

Precio actual, cuenta regresiva y el formulario de ofertar vivían dispersos: precio en
una mini-grilla de 3 columnas al final del panel, cuenta regresiva suelta arriba,
formulario de ofertar al final de todo. Ahora los tres viven juntos en una única "zona
de acción" (fondo con tinte de marca), ubicada ANTES de la descripción/ficha técnica --
lo que hace falta ver y hacer ahora mismo tiene prioridad visual sobre la información de
referencia:

- Precio actual: `text-4xl`/`text-5xl`, en vez de un número más entre otros dos.
- Cuenta regresiva (`LoteCountdown`): rediseñada más grande (`text-5xl`, antes
  `text-3xl`), en un box con borde propio -- "muy visible", pedido explícito.
- Botón de ofertar (`PlaceBidButton`): a todo el ancho, `py-3 text-base` (antes
  compartía fila con el input y usaba el tamaño default del botón) -- "con mucho
  protagonismo", pedido explícito. El input y el botón ahora se apilan siempre (antes
  se ponían lado a lado desde `sm:`), reforzando que el CTA es un bloque propio, no un
  campo de formulario más.

## Verificación

`tsc -b` limpio, suite completa de frontend (629 tests) en verde, `vite build` exitoso.
Un test existente de `ActiveLotePanel` se actualizó: la etiqueta "Sin ofertas todavía"
se reemplazó por "Precio inicial" (más precisa -- el monto mostrado en ese estado es,
literalmente, el precio inicial, no "nada").

**Nota de transparencia**: los valores de `top`/altura del sidebar sticky (`top-20`,
`calc(100vh-7rem)`) son estimados a partir de la altura conocida del header (`h-16`) y
el padding de `<main>` (`py-8`) -- no se pudieron verificar píxel a píxel en este
entorno (sin navegador real). Puede hacer falta un ajuste fino una vez revisado
visualmente.
