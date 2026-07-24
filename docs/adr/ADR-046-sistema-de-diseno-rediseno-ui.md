# ADR-046: Rediseño Integral de UI/UX (Etapa 1) — Sistema de Diseño, escalas de color completas, y adopción puntual de `lucide-react`

- **Fecha**: 2026-07-23
- **Estado**: Aceptada

## Contexto

Toda la funcionalidad de negocio del proyecto (Épicas 1-8) ya está implementada y
estable. Se inicia una nueva etapa exclusivamente visual: llevar el frontend —
funcional pero con Tailwind stock, sin sistema de diseño formal, sin sidebar, sin
`Tooltip`/`Table` — a una calidad de interfaz tipo SaaS moderno (referencia: Linear,
Notion, Stripe Dashboard, Vercel Dashboard, GitHub, Supabase), sin tocar lógica de
negocio, APIs, WebSockets ni arquitectura. Este es el primer ADR de esa iniciativa
(Etapa 1 de 7 planeadas); las siguientes etapas (navegación, dashboards, Sala del
Remate, Consola Operativa, post-remate/gestión, accesibilidad final) no requieren
decisiones de arquitectura nuevas y no tendrán ADR propio salvo que surja una.

## Decisión

### A. Escalas de color completas (50-900), anclando los valores ya en uso

`brand` (azul) tenía solo 5 tonos sueltos (`50/100/500/600/700`); `danger`/`success`
solo 3 (`50/500/600`); no existía `warning` (`Badge` lo simulaba con `amber` crudo de
Tailwind). Se completaron las cuatro escalas a 50-900, **manteniendo exactamente los
mismos valores hex que ya estaban en producción** para los tonos ya usados
(`brand-500=#2563eb`, `brand-600=#1d4ed8`, `brand-700=#1e40af`, y los anclajes
equivalentes de `danger`/`success`) — decisión explícita del usuario de no romper la
identidad de marca ya establecida. Los tonos nuevos (200/300/400/800/900) se
interpolaron alrededor de esos anclajes. `neutral` sigue siendo el `slate` de Tailwind
tal cual, sin alias nueva.

### B. Tipografía: Inter self-hosted (`@fontsource/inter`)

La familia tipográfica que de hecho usan Linear/Vercel/GitHub. Self-hosted vía
`@fontsource/inter` (paquete npm, sin CDN externo de Google Fonts) para no depender de
una red de terceros ni introducir un problema de privacidad/latencia -- coherente con
"mantener el árbol de dependencias controlado" (ADR-027) aplicado a *cómo* se sirve la
fuente, no a si se usa una. Se importaron los cuatro pesos ya usados en la app
(400/500/600/700, correspondientes a `font-normal`/`font-medium`/`font-semibold`/
`font-bold`) vía `--font-sans` en `@theme`.

### C. `lucide-react`: reversión puntual de ADR-027/028 en lo que a íconos respecta

ADR-027 (fundación del frontend) y ADR-028 (dashboard comprador, sección D) habían
descartado explícitamente cualquier librería de íconos (`lucide-react` nombrada ahí
mismo como alternativa rechazada) a favor de SVG a mano por feature, citando el
criterio general de "árbol de dependencias chico" de un volumen de íconos bajo en ese
momento. Dos cosas cambiaron: (1) el volumen de íconos ya no es bajo -- están dispersos
sin consistencia de trazo/grosor en al menos 6 archivos `icons.tsx` distintos, cada uno
con su propia mano; (2) el usuario pidió explícitamente una calidad visual "tipo
Linear/Stripe/Vercel", que en la práctica implica un set de íconos consistente, no
media docena de SVGs dibujados en momentos distintos del proyecto. Se adoptó
`lucide-react` (confirmado con el usuario antes de esta etapa) -- *tree-shakeable* (solo
se empaqueta lo que se importa, sin costo para lo que no se usa) y trazo *outline* de
2px consistente, el mismo lenguaje visual de esos productos de referencia. La migración
es gradual: esta etapa solo migra los íconos de `shared/components/` (`Modal` ✕,
`Breadcrumb` chevron, `DropdownMenu` kebab, más `AlertTriangle`/`UploadCloud` nuevos en
`ConfirmModal`/`Dropzone`, y los cuatro íconos de variante de `ToastViewport`); los
íconos por feature (`features/*/components/icons.tsx`) se migran progresivamente a
medida que cada pantalla se rediseña en las etapas siguientes, no de una sola vez.

### D. Consolidación de `Input`/`Select`/`Textarea`

Los tres triplicaban el mismo wrapper "label + control + `<p>` de error", cada uno con
su propio `useId`. Se extrajo a `shared/components/FieldWrapper.tsx`
(`useFieldIds`/`FieldWrapper`/`FIELD_CONTROL_CLASSES`), consumido internamente por los
tres -- ningún prop público de `InputProps`/`SelectProps`/`TextareaProps` cambió.

### E. Foco unificado por `ring`, no `outline`

`Button` usaba `focus-visible:outline`; `Input`/`Select`/`Textarea` usaban `focus:ring`
sin offset. Se unificó todo a `ring` (mismo lenguaje visual "SaaS moderno" que Linear/
Stripe), con `ring-offset-2` en botones (fondo sólido) y sin offset en campos de texto
(fondo blanco, no lo necesita).

### F. `Tooltip` y `Table`: primitivos nuevos, sin dependencia adicional

Pedidos explícitamente por el usuario, no existían. `Tooltip`: posicionamiento con CSS
puro (sin `@floating-ui`, sin detección de colisión con los bordes de la ventana --
alcanza para textos cortos sobre íconos/botones); se muestra por hover *y* por foco de
teclado, nunca solo por hover. `Table`: wrappers finos sobre `<table>` nativo
(`Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`), disponibles para
pantallas futuras que se beneficien de densidad tabular real -- **sin** forzar una
migración de los listados de "row-cards" ya usados en auditoría/historial/lotes, que
fueron una decisión de producto documentada explícitamente ("evitar tablas
excesivamente cargadas").

### G. Toasts: variante `warning`, `aria-live` persistente, transición de entrada/salida

`ToastViewport` ganó una variante `warning` (antes solo error/success/info), un ícono
por variante (`lucide-react`), y una transición sutil de entrada/salida con estado local
por `ToastItem` (sin librería de animación: `isVisible`/`isLeaving` + `transition-all`
de Tailwind, retrasando el `dismiss()` real del store ~150ms para que la salida se vea).
Gap de accesibilidad corregido: el contenedor externo ahora queda siempre montado en el
DOM con `aria-live="polite"` (antes retornaba `null` sin toasts) -- mutar el contenido
de una región ya presente es más confiable para lectores de pantalla que montar de cero
un nodo con `role="status"` en cada aviso nuevo.

## Alternativas consideradas

- **Mantener SVG a mano para íconos**: descartada, ver sección C -- ya no hay volumen
  bajo, y el usuario pidió explícitamente la consistencia visual que una librería da.
- **Cambiar el color de marca**: descartada -- decisión explícita del usuario de no
  romper la identidad ya establecida, ver sección A.
- **Modo oscuro en esta etapa**: descartado -- decisión explícita del usuario, evita
  duplicar la validación de cada componente/pantalla en dos temas a lo largo de las 7
  etapas planeadas. Los tokens (`@theme`, ya CSS custom properties con Tailwind v4)
  quedan preparados para agregarlo después sin rehacer nada.
- **`@floating-ui/react` para `Tooltip`**: descartada -- complejidad/dependencia
  adicional sin un caso de uso que la justifique todavía (textos cortos, sin
  colisión real esperada en los layouts actuales).
- **Migrar toda la app a `Table` ahora**: descartada, ver sección F -- reescribiría
  decisiones de producto ya tomadas y documentadas sin que el usuario lo haya pedido.

## Consecuencias

- **Ventajas**: una única fuente de verdad de color/tipografía para las 6 etapas de
  rediseño que siguen; los 17 primitivos compartidos ya reflejan el nuevo lenguaje
  visual antes de tocar una sola pantalla (efecto inmediato en toda la app); menos
  código duplicado (`FieldWrapper`); dos gaps reales de accesibilidad cerrados
  (`aria-live` de toasts, foco por teclado en tooltips).
- **Desventajas aceptadas**: `lucide-react` es una dependencia nueva (revierte
  puntualmente ADR-027/028) -- aceptada porque el pedido explícito de calidad visual
  "tipo SaaS" la justifica, y es tree-shakeable (costo real solo por lo que se importa).
  La migración de íconos por feature queda incompleta hasta que cada pantalla se
  rediseñe (no es un problema: ambos estilos conviven sin conflicto visual mientras
  dura la transición, ya que los SVG a mano ya replican trazos de grosor similar).
