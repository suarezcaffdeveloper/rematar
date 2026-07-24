# 49 — Accesibilidad Final (Rediseño Integral de UI/UX, Etapa 7 de 7)

Referencia rápida de la Etapa 7, última del rediseño de UI/UX (ver
[ADR-046](adr/ADR-046-sistema-de-diseno-rediseno-ui.md): "Etapa 1 de 7 planeadas...
accesibilidad final"). Sin cambios de lógica de negocio, API ni WebSockets -- todo lo
tocado acá es navegación por teclado, manejo de foco y una corrección de un antipatrón
de lector de pantalla ya presente desde antes del rediseño.

## El problema que se resolvía

Los primitivos y pantallas ya tenían buena base de accesibilidad (roles ARIA, `label`+
`aria-describedby` en formularios, `alt` en imágenes, `aria-live` en toasts) desde
etapas anteriores, pero quedaban gaps típicos de "pulido final" en una SPA:

- Sin link de "saltar al contenido": un usuario de teclado tenía que tabular por todo
  el sidebar/header en cada pantalla antes de llegar al contenido.
- Sin manejo de foco en cambios de ruta: al navegar, el foco quedaba en el link que se
  acababa de clickear -- un usuario de lector de pantalla no se enteraba de que la
  página había cambiado.
- `Modal` no atrapaba el foco (documentado como límite conocido desde la Épica 5.3) ni
  lo devolvía al disparador al cerrarse.
- El drawer mobile de `Sidebar` no era un diálogo accesible: sin `role="dialog"`, sin
  foco inicial, sin trap, sin devolver el foco al botón de hamburguesa al cerrarse.
- `DropdownMenu`/`NotificationBell` no soportaban flechas para recorrer sus ítems (patrón
  ARIA de menú), y Escape cerraba sin devolver el foco al disparador.
- `Tabs` (Etapa 5) no implementaba el patrón ARIA completo de pestañas: le faltaba
  tabindex "roving" (solo la pestaña activa debería ser alcanzable por Tab) y navegación
  por flechas.
- Ninguna animación/transición respetaba `prefers-reduced-motion`.
- **Antipatrón real en `LoteCountdown`**: el número grande llevaba `aria-live="polite"`
  actualizándose una vez por segundo -- exactamente el ejemplo que las WAI-ARIA
  Authoring Practices citan como qué NO hacer con un `role="timer"` (un lector de
  pantalla anunciaría el conteo completo cada segundo).

## Cambios

- **`shared/hooks/useFocusTrap.ts`** (nuevo): atrapa Tab/Shift+Tab dentro de un
  contenedor y restaura el foco al elemento que lo tenía antes de activarse. Un único
  hook compartido por `Modal` y el drawer mobile de `Sidebar` -- mismo comportamiento,
  sin duplicar la lógica de trap en los dos lugares.
- **`Modal.tsx`**: usa `useFocusTrap` -- cierra el límite conocido documentado desde la
  Épica 5.3 (sin trap completo).
- **`Sidebar.tsx`**: el drawer mobile gana `role="dialog"` + `aria-modal` + `aria-label`,
  foco inicial en el primer link, trap de Tab y restauración del foco al botón de
  hamburguesa al cerrarse (`useFocusTrap`).
- **`DropdownMenu.tsx`** / **`NotificationBell.tsx`**: ↑/↓ (o Home/End) recorren los
  ítems con wraparound, el foco se mueve al primer ítem al abrir, y Escape devuelve el
  foco al disparador -- antes solo cerraba.
- **`Tabs.tsx`**: tabindex "roving" (`tabIndex={0}` en la pestaña activa, `-1` en el
  resto) + ←/→/Home/End con wraparound, patrón ARIA completo de pestañas.
- **`AppLayout.tsx`**: link "Saltar al contenido principal" (invisible hasta recibir
  foco por teclado) + foco movido a `<main>` en cada cambio de ruta (no en el primer
  render, para no interferir con el foco inicial del navegador).
- **`styles/index.css`**: bloque global `@media (prefers-reduced-motion: reduce)` que
  recorta a ~0 la duración de cualquier animación/transición CSS -- un único punto de
  control para toda la app (pulso de `StatCard`, entrada/salida de `ToastViewport`,
  hovers con `transition-colors`, etc.), sin condicionar cada componente por separado.
- **`LoteCountdown.tsx`**: se saca `aria-live` del número que tictaquea cada segundo;
  una región `sr-only` separada anuncia solo los dos momentos que importan -- al cruzar
  el umbral urgente (una única vez, no en cada segundo posterior mientras siga urgente)
  y al llegar a cero ("Tiempo agotado.").

Sin cambios en `Input`/`Select`/`Textarea`/`FieldWrapper` (ya tenían `aria-invalid`/
`aria-describedby` conectados), `Table` (ya tenía `scope="col"`), `ImageGallery`/
`Breadcrumb`/`ToastViewport` (ya bien resueltos en etapas anteriores) ni en el `lang="es"`
de `index.html` (ya estaba).

## Verificación

`tsc -b` limpio, `oxlint` sin hallazgos nuevos sobre los archivos tocados (dos warnings
preexistentes en archivos no tocados por esta etapa, sin relación). Suite acotada a los
módulos modificados (política de testing desde el Módulo 7.6): 46 archivos de test, 301
tests en verde -- incluye tests nuevos para `useFocusTrap` (trap + wraparound +
restauración de foco), navegación por flechas en `DropdownMenu`/`Tabs`, y los dos nuevos
casos de `LoteCountdown` (ausencia de `aria-live` en el tictac, anuncios puntuales de la
región `sr-only`).

## Cierre del rediseño integral (Épica 9)

Con esta etapa se completan las 7 planeadas en [ADR-046](adr/ADR-046-sistema-de-diseno-rediseno-ui.md):
Sistema de Diseño ([43](43-sistema-de-diseno.md)), Navegación ([44](44-navegacion.md)),
Dashboards ([45](45-dashboards.md)), Sala del Remate
([46](46-sala-del-remate-rediseno.md)), Consola Operativa
([47](47-consola-operativa-rediseno.md)), Gestión Post-Remate
([48](48-gestion-post-remate-rediseno.md)) y esta -- Accesibilidad Final. En ningún
punto del proceso se modificó lógica de negocio, contratos de API ni arquitectura del
backend.
