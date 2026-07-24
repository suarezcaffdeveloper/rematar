# 44 — Navegación (Rediseño Integral de UI/UX, Etapa 2)

Referencia rápida de la Etapa 2 del rediseño de UI/UX -- reemplazo completo de la
navegación de la aplicación autenticada. El diseño ya estaba anticipado en
[ADR-046](adr/ADR-046-sistema-de-diseno-rediseno-ui.md) (sección de Navegación); este
documento describe la implementación concreta, sin decisiones de arquitectura nuevas.

## Qué cambió

`frontend/src/app/layouts/AppLayout.tsx` tenía un único header (logo + link `/admin`
condicional + nombre/rol + logout), sin sidebar y sin ninguna navegación persistente.
Se reemplazó por:

- **`Sidebar.tsx`**: navegación por rol (`NAV_ITEMS_BY_ROLE`) -- comprador: Remates/Mis
  compras; rematador: Mis remates/Ventas adjudicadas/Historial; admin: Panel de
  administrador (reemplaza el link condicional que antes vivía en el header, Épica
  8.0). Persistente desde `lg:` (1024px); por debajo, drawer con overlay y cierre por
  click-afuera/Escape, mismo criterio que `Modal.tsx`.
- **`Header.tsx`**: delgado, ya no tiene el logo (pasó al sidebar). Dibuja el
  breadcrumb de la pantalla actual (ver abajo) + nombre/rol del usuario + logout +
  botón de hamburguesa (solo visible por debajo de `lg:`, abre el drawer).
- **`breadcrumbStore.ts` / `useBreadcrumb.ts`**: cada página seguía renderizando su
  propio `<Breadcrumb>` (12 páginas) -- ahora declaran sus items vía
  `useBreadcrumb(items)` (un hook que los setea en un store Zustand al montar y los
  limpia al desmontar) y es el `Header` quien los dibuja una única vez. Mismo criterio
  que `useToastStore`: estado global mínimo, sin persistencia.

## Páginas migradas (12)

`RemateDetailPage`, `SalaPage`, `ConsolaOperativaPage`, `LotesManagementPage`,
`RemateAuditLogPage`, `RemateHistoryListPage`, `RemateHistoryDetailPage`,
`LoteHistoryDetailPage`, `MisComprasPage`, `VentasAdjudicadasPage`,
`MiCompraDetailPage`, `VentaAdjudicadaDetailPage`. En las que tienen estados de
carga/error, los items del breadcrumb se computan condicionalmente (vacío mientras
carga -- mismo comportamiento visual que antes, que tampoco mostraba nada en ese
estado) antes de cualquier `return` anticipado, para respetar las reglas de hooks.

## Verificación

`tsc -b` limpio, suite completa de frontend (596 tests) en verde, `vite build`
exitoso. Dos tests existentes (`SalaPage.test.tsx`, `ConsolaOperativaPage.test.tsx`)
que verificaban el breadcrumb buscándolo en el DOM de la página se actualizaron para
verificar `useBreadcrumbStore.getState().items` en su lugar, ya que la página ya no lo
renderiza directamente.
