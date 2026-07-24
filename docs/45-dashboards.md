# 45 — Dashboards (Rediseño Integral de UI/UX, Etapa 3)

Referencia rápida de la Etapa 3 del rediseño de UI/UX -- ampliación visual de los
dashboards de comprador y rematador, más un componente compartido (`StatCard`) y un
feature nuevo (`Notifications`) que ambos consumen. Sin cambios de backend: todo lo
mostrado sale de endpoints que ya existían.

## `shared/components/StatCard.tsx` (nuevo, unifica dos componentes)

Reemplaza a `features/analytics/components/KpiCard.tsx` (label + valor + flecha de
tendencia, usado en Analítica/Monitoreo/Historial) y al `StatChip` local de
`RematadorDashboardStats.tsx` (valor + barra de acento, sin tendencia) -- eran casi el
mismo componente con dos nombres distintos. `showTrend` (default `true`, igual que el
`KpiCard` original) y `accentClassName` (opcional, estilo `StatChip`) son ambos opt-in,
así que un único componente cubre los dos casos. Migrados sin cambios de comportamiento:
`AnalyticsPanel`, `MetricsGrid`, `RemateHistorySummary`, `RematadorDashboardStats`.

## `features/notifications/` (nuevo -- primer consumidor de un endpoint ya existente)

El Notification Service (`app/notifications/`) existe en el backend desde la Épica 7.5
pero nunca tuvo un consumidor de frontend hasta esta etapa. Se agregó:

- `api.ts`/`types.ts`/`hooks.ts` (`useNotifications`, `useUnreadNotificationCount`).
- `labels.ts`: ícono por prefijo de `Notification.type` (`postauction.*` →
  `PackageCheck`, `moderacion.*` → `AlertTriangle`, cualquier otro → `Bell` genérico --
  nunca rompe con un tipo nuevo que el backend agregue después).
- `components/NotificationBell.tsx`: montada una única vez en `Header` (global, en
  todas las pantallas) -- badge de no leídas, dropdown con las últimas, marcar
  una/todas como leídas.
- `components/RecentActivityCard.tsx`: tarjeta embebida en ambos dashboards.

**Decisión de diseño explícita**: el enunciado pedía "Notificaciones" y "Actividad
reciente" como dos secciones separadas en cada dashboard. No hay una fuente de datos
distinta para "actividad reciente" -- el backend no expone un feed de auditoría
agregado por todos los remates propios de un usuario (`AuditService` solo permite
`scope=remate` puntual o `scope=global` admin-only, ver `app/audit/router.py`). Las
notificaciones, en cambio, ya se generan exactamente ante los eventos que calificarían
como "actividad reciente" (lote adjudicado, cambio de estado post-remate, umbral de
ofertas inválidas superado) -- así que `RecentActivityCard` cubre ambos pedidos con la
misma lista, en vez de fabricar una segunda fuente sin datos reales detrás.

## `CompradorDashboardPage.tsx`

Fila de 3 `StatCard` nueva sobre la grilla ya existente: "Próximos remates"/"Remates en
vivo" (filtro client-side sobre la misma lista que ya trae `useRemates`, sin pedido
nuevo) y "Lotes ganados" (`useMisCompras(1, 1)`, solo para leer `data.total`). "Mis
compras" ya cubre lo que el enunciado pedía como "Historial": el backend prohíbe
explícitamente `/historial` para el rol `comprador` (`HistoryService.list_finished`,
403 -- ver docs/37), así que no existe una segunda vista de historial posible para ese
rol sin backend nuevo. Layout: grid `lg:grid-cols-3`, grilla de remates en las 2/3
columnas, `RecentActivityCard` en la columna restante -- mismo patrón ya establecido en
Sala/Consola Operativa.

## `RematadorDashboardPage.tsx`

`RematadorDashboardStats` (conteo por estado, ya existía) se mantiene tal cual, ahora
sobre `StatCard`. Fila nueva, solo visible si hay al menos un remate `live`: "Lotes
abiertos"/"Compradores conectados", agregados por `useLiveOperationalSummary`
(`features/rematador/hooks.ts`) -- un `GET .../snapshot` en paralelo por remate en vivo
(mismo endpoint que cada `RematadorRemateCard` ya usa individualmente). "Accesos
rápidos" ya estaba cubierto por los tres botones del header (Ventas adjudicadas/
Historial/Crear remate), no se duplicó. "Actividad reciente" reusa el mismo
`RecentActivityCard` del dashboard del comprador.

**Límite explícito**: "ofertas en tiempo real" del enunciado se representa como el
estado actual (lotes abiertos/conectados), recalculado al montar o recargar el
dashboard -- no un feed en vivo por WebSocket. Sostener N conexiones simultáneas (una
por remate en vivo) solo para esta fila de resumen sería un cambio de arquitectura
mayor al alcance puramente visual de esta etapa; un rematador que quiera ver ofertas
entrando en el momento ya tiene la Consola Operativa de ese remate puntual.

## Íconos

Continuando la migración gradual a `lucide-react` (ADR-046): `features/remates/
components/icons.tsx` (Calendar/MapPin/Box/Search/User/Clock/Users/Gavel) y
`PlusIcon` de `features/rematador/components/icons.tsx` ahora son wrappers finos sobre
el ícono de `lucide-react` equivalente, con el mismo nombre/props que ya usaban todos
los consumidores -- ningún archivo que los importa necesitó cambiar. Como estos íconos
se reusan en muchas pantallas además de los dos dashboards (Sala, Historial, Post-
remate), el cambio se nota en todas ellas de una sola vez, sin tener que tocar cada
pantalla por separado.

## Verificación

`tsc -b` limpio, suite completa de frontend (624 tests) en verde, `vite build` exitoso.
