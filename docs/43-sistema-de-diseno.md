# 43 — Sistema de Diseño (Rediseño Integral de UI/UX, Etapa 1)

Referencia del sistema de diseño creado en la Etapa 1 del rediseño integral de UI/UX
(ver [ADR-046](adr/ADR-046-sistema-de-diseno-rediseno-ui.md) para el razonamiento
completo de cada decisión). Este documento es la referencia rápida de qué tokens y
componentes existen para las etapas siguientes (navegación, dashboards, Sala del
Remate, Consola Operativa, post-remate/gestión, accesibilidad final).

## Tokens (`frontend/src/styles/index.css`)

Tailwind v4 CSS-first (`@theme`), sin `tailwind.config.*`. Cuatro escalas de color
completas 50-900 -- `brand` (azul), `danger` (rojo), `success` (verde), `warning`
(ámbar, nueva). `neutral` es el `slate` de Tailwind tal cual, sin alias. Los anclajes ya
en uso en producción se mantuvieron sin cambios (`brand-500=#2563eb`,
`brand-600=#1d4ed8`, `brand-700=#1e40af`, y los equivalentes de `danger`/`success`).

Tipografía: **Inter** (self-hosted, `@fontsource/inter`, pesos 400/500/600/700) vía
`--font-sans`. Sin tokens propios de spacing/radius/shadow -- se documenta la
convención ya en uso: `rounded-lg` en controles (botones, inputs), `rounded-xl` en
cards, `rounded-2xl` en modales, `rounded-full` en píldoras/avatares; `shadow-sm` en
reposo, `shadow-md`/`shadow-lg` en elementos elevados (menús, modales, toasts).

## Componentes (`frontend/src/shared/components/`)

Los 17 primitivos ya existentes fueron restyled al nuevo lenguaje visual (misma API
pública, foco unificado por `ring` en vez de mezclar `outline`/`ring`) y se agregaron
dos nuevos:

| Componente | Novedad en esta etapa |
|---|---|
| `Button` | Variantes con `shadow-sm`, foco por `ring` + `ring-offset-2` |
| `Input` / `Select` / `Textarea` | Wrapper compartido (`FieldWrapper.tsx`) -- ya no triplican el label+error+`useId` |
| `Card` | `rounded-xl` (antes `rounded-lg`), unifica el radio que la mayoría de las cards de feature ya usaban por su cuenta |
| `Modal` / `ConfirmModal` | `rounded-2xl`, ícono ✕ migrado a `lucide-react`; `ConfirmModal` con ícono de alerta en la variante `danger` |
| `Alert` / `Badge` | Variante `warning` real (antes `Badge` simulaba con `amber` crudo) |
| `Breadcrumb` | Chevron migrado a `lucide-react` |
| `DropdownMenu` | Kebab migrado a `lucide-react`, foco por `ring` en el disparador |
| `Dropzone` | Ícono de upload (`lucide-react`) agregado |
| `EmptyState` | Ícono envuelto en círculo (`bg-slate-100`) |
| `Skeleton` / `Spinner` / `ProgressBar` | Sin cambios de fondo, ya alineados |
| **`Tooltip`** (nuevo) | Hover + foco de teclado, posicionamiento CSS simple, sin `@floating-ui` |
| **`Table`** (nuevo) | `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, disponible para pantallas futuras -- no reemplaza los listados de cards ya usados en auditoría/historial/lotes |

`shared/toast/`: `ToastViewport` gana la variante `warning`, un ícono por variante,
transición de entrada/salida (estado local, sin librería de animación), y el
contenedor externo ahora queda siempre montado con `aria-live="polite"` (antes
retornaba `null` sin toasts -- gap de accesibilidad corregido).

## Íconos

`lucide-react` adoptado (ver ADR-046, sección C) para los íconos de `shared/components/`
en esta etapa. Los íconos por feature (`features/*/components/icons.tsx`, SVG a mano)
se migran progresivamente a medida que cada pantalla se rediseñe en las etapas
siguientes -- no de una sola vez, para no mezclar un refactor de íconos con el resto del
trabajo de cada etapa.

## Cómo usar esto en las próximas etapas

- Reusar siempre los primitivos de `shared/components/` antes de escribir un elemento
  nuevo a mano -- si falta una variante, extenderla ahí (no crear un uno-off local).
- Nuevos íconos: importar de `lucide-react`, no dibujar un SVG nuevo a mano.
- Nuevas pantallas con datos tabulares densos: evaluar `Table` en vez de una lista de
  cards, caso por caso -- no es un reemplazo automático de lo ya construido.
- Colores: usar siempre `brand`/`danger`/`success`/`warning`/`slate`, nunca un color
  Tailwind crudo fuera de esas cinco escalas (evita repetir el gap que tenía `warning`).
