# ADR-050: Garantía Económica — preautorización de tarjeta vía Mercado Pago, resuelta por eventos sin ciclo de módulos

- **Fecha**: 2026-09-16
- **Estado**: Aceptada

## Contexto

Una empresa dueña de un remate puede querer exigir una garantía económica para que un
comprador pueda ofertar: evita pujas sin respaldo y protege a la empresa si el ganador
no paga. El pedido explícito del usuario fue "lo más rápido, que el comprador no tenga
bloqueado el dinero por muchos días ni tenga problemas de que no se lo devuelvan" — eso
descarta cualquier mecanismo de transferencia manual o retención prolongada a favor de
una **preautorización de tarjeta de crédito** (hold): se retiene el monto anunciado sin
cobrarlo, y recién se captura si el comprador gana un lote; si no gana nada, se libera
automáticamente al cerrar el remate.

Antes de esta feature no existía ninguna integración de pagos real en el proyecto — solo
el tracking manual de `PostAuctionCase.status` (`PAGO_PENDIENTE`/`PAGO_RECIBIDO`).

## Decisión

### A. Proveedor: Mercado Pago, vía "captura diferida"

El proyecto ya opera en ARS con lógica específica de Argentina (normalización de
teléfonos para WhatsApp) — Mercado Pago es el proveedor dominante en ese mercado y
expone exactamente el mecanismo necesario: crear un pago con `capture: false` (el hold),
después `capture: true` (con `transaction_amount` opcional para captura parcial) para
cobrar, o cancelar mientras está `authorized` para liberar. La tokenización de la
tarjeta ocurre en el navegador (Payment Brick, dentro de un iframe propio de Mercado
Pago) — el backend nunca recibe ni valida un número de tarjeta crudo (PCI-DSS, SAQ A).

### B. Alcance: un hold por remate completo, no por lote

La empresa define, al configurar el remate (`RemateSettings.guarantee_required`/
`guarantee_amount`), si exige garantía y de qué monto. Un único hold habilita al
comprador a ofertar en cualquier lote de ese remate — más simple de operar y de
entender para el comprador que sostener varios holds simultáneos por el mismo remate.

### C. Módulo de dominio propio (`app/modules/garantias/`), no un paquete transversal tipo `postauction`

A diferencia de `app/postauction/` (reactor/compositor *sobre* el dominio de subastas,
sin que ningún módulo de dominio dependa de él), `garantias` es un requisito que el
propio Auction Engine necesita consultar de forma **síncrona y bloqueante** antes de
aceptar una oferta (la garantía condiciona si se puede ofertar, no es un efecto
posterior) — por eso vive como par de `app/modules/ofertas/`, con una dependencia real
`ofertas -> garantias` (`AuctionEngine.place_bid` llama
`GarantiaService.assert_active_or_raise`), verificada por
`test_architecture_boundaries.py` igual que cualquier otro límite de módulo del
proyecto.

### D. Cierre resuelto por eventos, evitando cerrar un ciclo de tres módulos

El punto más delicado de todo el diseño: `garantias` necesita saber "¿este comprador
ganó algún lote de este remate?" para decidir entre capturar o liberar al cerrar. La
fuente de verdad de esa pregunta es `PostAuctionCase` (`app/postauction/`). Importar
`app.postauction` directamente desde `garantias` habría cerrado un ciclo de tres
módulos: `ofertas -> garantias -> postauction -> ofertas` (esta última arista ya existe:
`PostAuctionEventDispatcher` usa `OfertaRepository` para resolver la oferta líder en un
cierre manual). Ningún otro par de módulos del proyecto tiene una dependencia
bidireccional así, y habría hecho imposible extraer cualquiera de los tres por
separado (ADR-001).

En cambio, `GarantiaEventDispatcher` (`app/modules/garantias/realtime.py`) es un
**cuarto** consumidor independiente sobre el mismo canal Redis `events.*` — mismo
patrón exacto que `PostAuctionEventDispatcher`/`ChatSystemEventDispatcher`: lee el JSON
crudo de `postauction.case_created` (que ya trae `remate_id`/`buyer_id`) sin importar
esa clase de evento ni el módulo que la publica. Reacciona además a
`remate.finished`/`remate.cancelled` para liberar cualquier garantía que haya quedado
`ACTIVE` sin un `postauction.case_created` asociado. Resultado: `garantias` no importa
`app.postauction` ni `app.modules.ofertas` en ningún archivo (verificado por
`test_garantias_never_imports_websocket_realtime_snapshot_ofertas_or_postauction`), y
`app/modules/remates/` tampoco importa `garantias`
(`test_remates_never_imports_garantias`) — el grafo de dependencias sigue siendo un DAG.

Efecto secundario aceptado, y una mejora de UX real: la captura ocurre apenas se sabe
que el comprador ganó (reaccionando a `postauction.case_created`), no recién cuando
cierra todo el remate — el comprador ve su garantía `captured` de inmediato si gana
temprano, en vez de esperar a que se resuelvan todos los demás lotes.

### E. Expiración resuelta localmente, sin re-consultar a Mercado Pago

Una preautorización vence sola del lado del emisor pasado
`MERCADOPAGO_HOLD_VALIDITY_DAYS` (config, no hardcodeado — el proveedor puede cambiar
ese valor). `GarantiaExpiryScheduler` solo actualiza el estado local a `EXPIRED` cuando
eso ya pasó (nunca llama a Mercado Pago para esto: el hold ya no existe de su lado) y
avisa al comprador dentro de una ventana de anticipación
(`GUARANTEE_EXPIRY_WARNING_HOURS`) para que vuelva a autorizar. El aviso se implementó
como **notificación in-app** (`app.notifications`, genérico, ya existente desde
ADR-044), no por email/WhatsApp: el pipeline `app/notify/` está hardcodeado a un único
tipo de notificación ("lote adjudicado") con plantillas propias, y extender WhatsApp
exigiría una plantilla nueva aprobada en Meta Business Manager — una acción de negocio
fuera de lo que se puede resolver en esta fase. Queda documentado como limitación
conocida, no como omisión silenciosa.

Limitación conocida más importante de esta v1: un remate **LIVE** de duración no
acotada (puede quedar pausado indefinidamente) no tiene forma de garantizar de
antemano que cierre antes de que cualquier hold individual expire — depende de que el
comprador re-autorice a tiempo tras el aviso. Un remate **TIMED**, con `starts_at`/
`ends_at` conocidos de antemano, sí puede (y debería, en una fase futura) validarse
contra `MERCADOPAGO_HOLD_VALIDITY_DAYS` al configurar la garantía.

### F. Frontend: SDK vanilla de Mercado Pago, no `@mercadopago/sdk-react`

Se evitó sumar una dependencia npm de un paquete de terceros cuya compatibilidad con
React 19 no está confirmada. `mercadopagoBrick.ts` es el único archivo del frontend que
toca `window.MercadoPago` (carga el script `sdk.mercadopago.com/js/v2` dinámicamente,
monta el Card Payment Brick) — el resto de la UI (`GarantiaGate.tsx`) no sabe nada de
scripts ni de iframes, solo recibe `cardFormData` ya tokenizado vía un callback. Sin
`VITE_MERCADOPAGO_PUBLIC_KEY` configurada (la mayoría de los entornos), el paso de
carga de tarjeta muestra un aviso de "no disponible" en vez de romper — mismo criterio
opt-in que `MERCADOPAGO_ENABLED` del lado del backend.

## Alternativas consideradas

- **Transferencia bancaria o retención manual del monto**: descartada de entrada — no
  cumple "rápido" ni "el comprador no tiene el dinero bloqueado por muchos días", el
  pedido explícito del usuario.
- **`garantias -> postauction` directo para resolver "¿ganó algo?"**: descartada, ver
  sección D — cierra un ciclo de tres módulos que ningún otro par del proyecto tiene.
- **`garantias -> ofertas` directo (consultar `Oferta.status == ACCEPTED`)**: descartada
  por el mismo motivo — ciclo de dos módulos con `ofertas -> garantias`, más ajustado
  todavía que la alternativa de arriba.
- **Extender `app/notify/` (email/WhatsApp) para el aviso de expiración**: descartada
  para esta fase, ver sección E — WhatsApp exige una plantilla nueva aprobada en Meta
  Business Manager, fuera de alcance de un cambio de código.
- **`@mercadopago/sdk-react`**: descartada, ver sección F — compatibilidad con React 19
  no confirmada; el SDK vanilla + un wrapper propio da el mismo resultado sin ese
  riesgo.
- **Captura únicamente al cerrar todo el remate (`remate.finished`)**: descartada, ver
  sección D — capturar apenas se conoce el ganador (`postauction.case_created`) es
  mejor UX y no requiere esperar a resolver el resto de los lotes.

## Consecuencias

- **Ventajas**: el grafo de dependencias entre `garantias`/`ofertas`/`postauction`/
  `remates` sigue siendo un DAG, verificado por tests estáticos, no solo documentado;
  la garantía se resuelve (captura o libera) en el momento correcto sin que ningún
  módulo de dominio existente necesite saber que `garantias` existe; el adapter de
  Mercado Pago (`Null`/`Real`) permite desarrollar y testear todo el flujo sin
  credenciales reales.
- **Desventajas aceptadas**: un remate LIVE muy largo con garantía requerida depende de
  que el comprador re-autorice a tiempo (sin eso, no hay forma de eliminar el límite de
  validez de la preautorización sin guardar la tarjeta y cobrar bajo demanda — rediseño
  mayor, fuera de alcance); el aviso de expiración es solo in-app, no llega a un
  comprador que no abra la plataforma; un fallo transitorio de Mercado Pago durante la
  captura/liberación automática (`GarantiaEventDispatcher`) no tiene un backstop de
  reintento automático todavía — motivo por el que evitar el ciclo de módulos (sección
  D) importaba: cualquier reconciliación futura tiene que resolverse con el mismo
  mecanismo de eventos, no con un import nuevo hacia `postauction`/`ofertas`.
- Sumar Decidir/otro proveedor a futuro es: una nueva implementación de
  `MercadoPagoClient`-equivalente (`Protocol` ya aislado en `mercadopago_client.py`) más
  su selección en `dependencies.py` — sin tocar `GarantiaService`, el gate, ni el
  dispatcher.
