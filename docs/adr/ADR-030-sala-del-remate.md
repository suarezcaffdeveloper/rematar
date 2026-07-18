# ADR-030: Sala del remate (versión inicial) — feature propio que espeja el límite de módulo del Snapshot Service, montos como string, sin polling

- **Fecha**: 2026-07-25
- **Estado**: Aceptada

## Contexto

Épica 4, Módulo 4.5 pide la pantalla principal de un remate en vivo, resuelta
**enteramente con el Snapshot Service** que el backend ya expone completo desde la
Épica 3 (Módulo 3.6) — con la restricción explícita de NO usar WebSockets todavía, a
pesar de que el Gateway, el Event Bus y la sincronización en tiempo real también ya
existen. El objetivo doble de este módulo es (a) una pantalla completa y útil solo con
una foto fija del estado, y (b) que agregar tiempo real después no obligue a
rediseñar nada. Tres decisiones de estructura quedaron por tomar: dónde vive este
código nuevo, cómo tipar los montos de dinero que trae el snapshot, y cómo mantener la
pantalla "lista para WebSockets" sin construir código muerto que simule algo que este
módulo no debe implementar.

## Decisión

### A. `features/sala/` como feature propio, no una extensión de `features/remates/`

El backend ya traza este límite: `app/snapshot/` no vive dentro de
`app/modules/remates/` ni `app/modules/ofertas/` — es su propio paquete que compone
`RemateRead`/`LoteRead` (de esos dos módulos) con un DTO propio
(`OfertaSnapshotEntry`), documentado explícitamente en el docstring de
`app/snapshot/schemas.py` como una decisión deliberada. `features/sala/` replica
exactamente ese límite del lado del frontend: importa `Remate`/`Lote` de
`features/remates/types.ts` en vez de duplicarlos, y define `OfertaSnapshotEntry`/
`RemateStateSnapshot` como lo que son — el snapshot en sí, no parte del dominio
"remates". Además, la sala va a crecer de forma sustancial en módulos futuros (cliente
WebSocket, estado en vivo, ofertas, eventualmente chat/presencia) — separarla ahora
evita que `features/remates/` (hoy: dashboard + detalle) termine cargando con un
dominio que conceptualmente es distinto: "explorar y consultar remates" vs. "participar
de un remate en curso".

### B. Montos de dinero como `string` en los tipos, verificado contra una respuesta real

En vez de asumir que un campo `Decimal` de Pydantic se serializa como `number` en JSON,
se probó contra el backend real corriendo en Docker
(`GET /remates/{id}/snapshot`, comprador autenticado): `"base_price": "1000.00"` — un
`string`, no un `number`. Pydantic v2 serializa `Decimal` preservando su representación
exacta en vez de convertirlo a `float`, evitando el error de redondeo binario de IEEE
754 en montos de dinero (`0.1 + 0.2 !== 0.3` aplicado a precios sería inaceptable). Los
tipos de `features/remates/types.ts::Lote` (`base_price`, `min_increment`,
`reserve_price`, `final_price`) y `features/sala/types.ts::OfertaSnapshotEntry.amount`
reflejan esto como `string`; `shared/lib/format.ts::formatCurrency` hace el único
`Number(...)` necesario, en el borde de presentación, con un `try/catch` que cae a un
formato de respaldo si el código de moneda no fuera válido para `Intl.NumberFormat`.

### C. Sin polling, una sola carga — `useRemateSnapshot` no se dispara solo

El módulo prohíbe explícitamente WebSockets, pero no obliga a que la pantalla se sienta
completamente estática — se evaluó agregar un `setInterval` que refrescara el snapshot
cada N segundos como aproximación barata a "tiempo real". Se descartó: haría parecer que
la pantalla actualiza sola cuando en realidad solo refresca a destiempo, generando una
expectativa de tiempo real que el enunciado pide explícitamente NO construir todavía —
mejor una pantalla honestamente estática (con un botón "Actualizar" manual en el estado
vacío de "sin lote activo") que una que simula tiempo real a medias. `useRemateSnapshot`
pide una sola vez al montar (o al llamar `reload()` explícitamente), mismo patrón que
`useRemateDetail` (Módulo 4.4).

### D. Preparación para WebSockets: contrato de props, no código simulado

Se evaluó dejar ganchos explícitos para WebSockets (por ejemplo, un
`useLiveRemateState` a medio implementar, o un `onEvent` prop sin uso real) — se
descartó por ser código muerto que este módulo no debe construir ("no implementar
todavía" es una instrucción explícita, no una sugerencia de dejar stubs). La
preparación real es arquitectónica: cada componente de presentación
(`SalaHeader`/`ActiveLotePanel`/`OfferHistoryPanel`) recibe los datos que necesita como
props de tipo `RemateStateSnapshot` (o un recorte de él) y no importa
`features/sala/api.ts` ni `hooks.ts` — no le importa si esos datos vinieron de una
llamada HTTP única o de una que además se actualiza por WebSocket. Cuando exista un
cliente WebSocket, el cambio queda contenido en `hooks.ts` (agregar un
`useLiveRemateState` que envuelve a `useRemateSnapshot`) y en `SalaPage.tsx` (usar ese
hook en vez del actual) — cero cambios en los componentes de presentación. `PlaceBidButton`
recibe el mismo tratamiento: aislado en su propio archivo para que activarlo de verdad
sea reemplazar un componente, no reescribir `ActiveLotePanel`.

## Alternativas consideradas

- **Extender `features/remates/` en vez de crear `features/sala/`**: descartado por la
  sección A — mezclaría el dominio de "explorar remates" con el de "participar de uno
  en curso", que van a crecer en direcciones distintas (el segundo necesita estado de
  WebSocket, el primero no).
- **Tipar los montos como `number`**: descartado tras confirmar empíricamente que el
  backend los serializa como `string` — tipar como `number` habría sido silenciosamente
  incorrecto (funcionaría en desarrollo por coerción implícita de JS en algunos casos,
  rompería en producción de forma sutil).
- **Polling con `setInterval`**: descartado por la sección C — genera una falsa
  sensación de tiempo real que el enunciado pide explícitamente evitar en este módulo.
- **Dejar hooks/props de WebSocket a medio construir**: descartado por la sección D — la
  preparación es de contrato (props tipadas, separación de responsabilidades), no de
  código que simula una funcionalidad que todavía no existe.

## Consecuencias

- **Ventajas**: `features/sala/` puede crecer (estado de WebSocket, Zustand store propio
  si hace falta) sin reorganizar `features/remates/`; los montos nunca pierden
  precisión por una conversión implícita a `float`; la pantalla es honesta sobre no
  tener tiempo real en vez de simularlo mal; agregar WebSockets en un módulo futuro es
  un cambio acotado a `hooks.ts`/`SalaPage.tsx`, no un rediseño de componentes.
- **Desventajas aceptadas**: un usuario que deja la sala abierta no ve la oferta
  ganadora cambiar sola (esperado y deseado en este módulo, no un bug); todo texto de
  dinero tiene que pasar por `formatCurrency` en vez de interpolarse directo (un
  desarrollador nuevo podría intentar `${lote.base_price}` sin darse cuenta de que ya
  viene formateado como string de 2 decimales, no un número navegable — mitigado con el
  comentario extenso en `types.ts` sobre por qué es `string`).
- El día que exista un cliente WebSocket, el trabajo es exactamente el descripto en la
  sección D — ninguna decisión de este ADR necesita revisarse para eso.
