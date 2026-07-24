# 48 — Gestión Post-Remate (Rediseño Integral de UI/UX, Etapa 6)

Referencia rápida de la Etapa 6 del rediseño de UI/UX. Sin cambios de lógica de
negocio ni de API: `PostAuctionService`, la máquina de estados de 8 pasos y todos los
endpoints que las páginas consumen siguen siendo los mismos (ver
[41-gestion-post-remate.md](41-gestion-post-remate.md)).

## El problema que se resolvía

`MiCompraDetailPage`/`VentaAdjudicadaDetailPage` mostraban el precio final como una
celda más de una grilla de cuatro, con el mismo peso visual que "Adjudicado el" u
"Observaciones" -- sin la jerarquía que Sala (Etapa 4) y Consola (Etapa 5) ya le dan a
su dato más importante en una "zona de acción" destacada. El `ProgressStepper` marcaba
los pasos completados con un carácter Unicode ("✓") en vez de un ícono `lucide-react`,
inconsistente con el resto de la app desde la adopción de la librería en la Etapa 1.
`Timeline` describía la acción de cada entrada como texto plano, mientras que
`AuditLogTimeline` (su par declarado, ver comentario en `Timeline.tsx`) ya usaba un
`Badge` de color por acción. Por último, `AdminAuditLogPage` seguía con el
`role="tablist"` a mano que la Etapa 5 ya había extraído a `shared/components/Tabs.tsx`
sin migrar todavía a quien le dio origen al patrón.

## Cambios

- **`ProgressStepper.tsx`**: el paso completado ahora usa el ícono `Check` de
  `lucide-react` en vez del carácter `✓`.
- **`Timeline.tsx`**: la acción de cada entrada (`case_created`/`status_changed`/
  `note_added`) se muestra en un `Badge` (`brand`/`success`/`neutral`) en vez de texto
  plano, mismo criterio que `AuditLogEntryCard`.
- **`MiCompraDetailPage.tsx` / `VentaAdjudicadaDetailPage.tsx`**: el `Card` con
  `ProgressStepper` y la grilla de cuatro campos se reemplazan por una única "zona de
  estado" (fondo con tinte de marca, mismo tratamiento que `ActiveLotePanel`/
  `ConsolaLotePanel`) que combina el indicador de progreso con el precio final
  destacado; la contraparte y la fecha de adjudicación quedan como datos secundarios al
  lado. Las observaciones, cuando existen, pasan a su propia tarjeta liviana en vez de
  ocupar una celda de la grilla.
- **`AdminAuditLogPage.tsx`**: migra su tablist manual a `shared/components/Tabs.tsx`
  (deuda documentada explícitamente en
  [47-consola-operativa-rediseno.md](47-consola-operativa-rediseno.md)).

Sin cambios en `CaseCard`, `SearchFilterBar`, `StatusChangeForm`, `NoteForm`,
`StatusBadge` ni en los hooks/api del feature -- ya seguían los primitivos y patrones
del sistema de diseño desde su implementación original (Épica 7.5).

## Verificación

`tsc -b` limpio, `oxlint` sin hallazgos sobre los archivos tocados. Suite de tests
acotada a los módulos modificados (política de testing desde el Módulo 7.6): 7 archivos
de test de `features/postauction/` y `app/pages/` en verde (24 tests), incluyendo el
ajuste de `ProgressStepper.test.tsx` para verificar el ícono de check por `<svg>` en vez
del carácter Unicode.
