# 50 — Garantía Económica (bloqueo de tarjeta vía Mercado Pago)

Referencia de diseño de la garantía económica: cómo una empresa la exige, cómo un
comprador la constituye, cómo se resuelve (captura o liberación) al cerrar el remate, y
la política de expiración. Ver [ADR-050](adr/ADR-050-garantia-economica-preautorizacion.md)
para el razonamiento completo de las decisiones tomadas.

## Alcance de este módulo

- **Preautorización, no cobro**: al ofertar en un remate que la exige, el comprador
  tokeniza su tarjeta (Payment Brick de Mercado Pago) y el backend crea un hold
  (`capture: false`) por el monto que definió la empresa. El dinero no se mueve todavía.
- **Un hold por remate**, no por lote — habilita ofertar en cualquier lote de ese
  remate.
- **Resolución automática al cierre**: si el comprador gana al menos un lote, se
  captura el monto íntegro de la garantía (se descuenta del precio final; el resto,
  si el precio final lo supera, sigue el flujo manual ya existente de
  `PostAuctionCase`). Si no gana nada, se libera automáticamente.
- **Expiración**: una preautorización vence sola del lado de Mercado Pago pasados
  `MERCADOPAGO_HOLD_VALIDITY_DAYS`. Un scheduler la marca `EXPIRED` localmente y avisa
  (notificación in-app) al comprador antes de que eso pase, para que la renueve.
- **Gate real**: `AuctionEngine.place_bid` rechaza (403) cualquier oferta de un
  comprador sin una garantía `ACTIVE`, cuando el remate la exige — es la única defensa
  que importa; todo lo demás (frontend, aviso) es UX.

**No se implementa** en esta v1: cobro automático del saldo si el precio final supera
la garantía (sigue el flujo manual existente), aviso de expiración por email/WhatsApp
(solo in-app — ver ADR-050, sección E), ni una validación que impida configurar un
remate LIVE de duración indefinida con garantía requerida (sí sería posible para TIMED,
que tiene fechas conocidas de antemano — punto de extensión natural).

## Dónde vive el código (backend)

`app/modules/garantias/` — módulo de dominio propio, par de `app/modules/ofertas/` (no
un paquete transversal como `app/postauction/` — ver ADR-050, sección C).

| Archivo | Responsabilidad |
|---|---|
| `models.py` | `GarantiaStatus` (enum nativo, 6 valores), `Garantia` (registro vivo, unique `remate_id`+`buyer_id`, FKs `RESTRICT`), `GarantiaEvent` (insert-only, historial crudo de Mercado Pago, `garantia_id` en `CASCADE`). |
| `mercadopago_client.py` | `MercadoPagoClient` (`Protocol`), `NullMercadoPagoClient` (sin credenciales), `RealMercadoPagoClient` (httpx, reintentos en errores transitorios) -- `create_hold`/`capture`/`cancel`/`get_status`. |
| `webhook_signature.py` | Verificación HMAC-SHA256 del header `x-signature` de Mercado Pago -- fail closed. |
| `repository.py` | `GarantiaRepository` -- CRUD, `list_active_by_remate`, `list_active_expiring_before`. |
| `service.py` | `GarantiaService` -- `create_or_retry` (idempotente, reintenta sobre la misma fila tras `FAILED`), `assert_active_or_raise` (el gate), `release`/`capture`, `reconcile` (contra `get_status`, nunca confía ciegamente en un webhook). |
| `schemas.py` | `GarantiaCreateRequest` (`card_payment_data` opaco del Brick), `GarantiaRead` (nunca expone `mp_payment_id`/`mp_status` crudos). |
| `realtime.py` | `GarantiaEventDispatcher` -- cuarto consumidor independiente sobre `events.*`: `postauction.case_created` captura, `remate.finished`/`remate.cancelled` liberan lo que quedó `ACTIVE` (ver ADR-050, sección D, por qué no importa `app.postauction` para esto). |
| `scheduler.py` | `GarantiaExpiryScheduler` -- expira localmente lo vencido, avisa (in-app) lo próximo a vencer. |
| `dependencies.py`, `router.py` | `POST /remates/{id}/garantia`, `GET /remates/{id}/garantia/me`, `POST /webhooks/mercadopago`. |

**Archivos existentes tocados**, todos additivos:

- `app/modules/remates/schemas.py`/`models.py`: `RemateSettings.guarantee_required`/
  `guarantee_amount`, `DEFAULT_REMATE_SETTINGS`.
- `app/modules/remates/service.py`: `mode="json"` al serializar `settings` a JSONB
  (`Decimal` de `guarantee_amount` no es serializable por el encoder JSON estándar).
- `app/modules/ofertas/engine.py`/`dependencies.py`: el gate en `place_bid`, inyección
  de `GarantiaService`.
- `app/modules/bots/runner.py`: los bots simulados también respetan el gate.
- `app/main.py` (`_lifespan`): un **sexto** `EventConsumer` (`GarantiaEventDispatcher`)
  y un `GarantiaExpiryScheduler`, arrancados/detenidos junto a los demás.
- `app/api/router.py`, `app/db/base.py`: registro del router/modelos nuevos.
- `app/core/config.py`: `MERCADOPAGO_*`, `GUARANTEE_EXPIRY_WARNING_HOURS`.
- `tests/test_architecture_boundaries.py`: dos tests nuevos que verifican el límite de
  módulo descrito en ADR-050, sección D.

## Dónde vive el código (frontend)

`frontend/src/features/garantias/` — feature propia, análoga a cómo `sala`/`remates`
están organizados.

| Archivo | Responsabilidad |
|---|---|
| `types.ts` | `GarantiaStatus`, `Garantia`, `CardPaymentBrickData`. |
| `api.ts` | `fetchMyGarantiaRequest`, `createGarantiaRequest`. |
| `mercadopagoBrick.ts` | Único punto que toca `window.MercadoPago` -- carga el SDK, monta/desmonta el Card Payment Brick. Ver ADR-050, sección F. |
| `components/GarantiaGate.tsx` | Aviso + modal (consentimiento -> Brick -> polling hasta resolución) -- montado en `SalaPage`/`TimedSalaPage` cuando el remate exige garantía y el viewer es comprador. |

**Archivos existentes tocados**:

- `features/remates/types.ts`: `RemateSettings.guarantee_required`/`guarantee_amount`
  (opcionales a nivel de tipo, mismo criterio pragmático que otros campos nuevos del
  archivo -- no rompe fixtures de test existentes).
- `features/rematador/remateForm.ts`/`RemateFormModal.tsx`: toggle + monto, configurado
  por la empresa al crear/editar el remate.
- `features/sala/pages/SalaPage.tsx`, `features/timedSala/pages/TimedSalaPage.tsx`:
  montan `GarantiaGate`, trackean el estado y se lo pasan a `SalaBidPanel`/
  `TimedLoteBidRail`.
- `features/sala/components/PlaceBidButton.tsx`: nueva prop `hasRequiredGuarantee`,
  deshabilita "Ofertar" con un mensaje claro si falta.
- `shared/config/env.ts`, `.env.example`: `VITE_MERCADOPAGO_PUBLIC_KEY` (opcional --
  sin ella, el paso de carga de tarjeta avisa que no está disponible en ese entorno).

## Flujo completo

1. La empresa activa "Exigir garantía económica" al crear/editar el remate y define el
   monto (`RemateFormModal`) -- persiste en `RemateSettings`.
2. Un comprador entra a la Sala de ese remate: `GarantiaGate` consulta
   `GET .../garantia/me`. Si no hay una garantía `ACTIVE`, muestra el monto y un botón
   para constituirla.
3. Al aceptar, el comprador ve el Card Payment Brick de Mercado Pago (tokeniza en su
   propio iframe) y lo completa. El frontend llama `POST .../garantia` con el
   `card_payment_data` que le devolvió el Brick.
4. `GarantiaService.create_or_retry` crea el hold (`capture: false`). Si Mercado Pago
   confirma `authorized`, la garantía queda `ACTIVE` (con `expires_at`); si rechaza la
   tarjeta o falla, queda `FAILED` con el motivo -- el comprador puede reintentar (misma
   fila, por el unique `remate_id`+`buyer_id`).
5. Con la garantía `ACTIVE`, `AuctionEngine.place_bid` deja de rechazar sus ofertas.
6. Al ganar un lote, `PostAuctionService` publica `postauction.case_created`;
   `GarantiaEventDispatcher` captura la garantía de inmediato. Al cerrar/cancelar el
   remate, cualquier garantía que haya quedado `ACTIVE` (no ganó nada) se libera.
7. Si la preautorización está por vencer sin que el remate haya cerrado,
   `GarantiaExpiryScheduler` avisa (notificación in-app) para que el comprador la
   renueve repitiendo el paso 3; si ya venció, la marca `EXPIRED` (mismo trato que "sin
   garantía" para el gate).

## Configuración necesaria

- Backend: `MERCADOPAGO_ENABLED`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PUBLIC_KEY`,
  `MERCADOPAGO_WEBHOOK_SECRET` (ver `app/core/config.py` para el resto, con sus
  defaults de desarrollo). Sin `MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_ENABLED=false`,
  se usa `NullMercadoPagoClient` -- cualquier intento de constituir una garantía queda
  `FAILED` con un mensaje claro, sin romper el resto del flujo.
- Frontend: `VITE_MERCADOPAGO_PUBLIC_KEY` (ver `.env.example`).
- Producción: verificar contra la documentación vigente de Mercado Pago la ventana real
  de validez de una captura diferida (`MERCADOPAGO_HOLD_VALIDITY_DAYS`) y el algoritmo
  de firma de webhooks (`webhook_signature.py`) antes de habilitar `MERCADOPAGO_ENABLED`
  con credenciales reales -- ambos están documentados como "verificar antes de
  producción" en el código, no asumidos a ciegas.

## Limitaciones conocidas (v1)

- Un remate **LIVE** de duración indefinida con garantía requerida depende de que el
  comprador renueve a tiempo tras el aviso de expiración -- no hay forma de eliminar
  ese requisito sin guardar la tarjeta y cobrar bajo demanda (rediseño mayor).
- El aviso de expiración es solo in-app -- un comprador que no abre la plataforma no se
  entera por otro canal.
- Sin backstop de reintento automático si `GarantiaEventDispatcher` falla al
  capturar/liberar por una falla transitoria de Mercado Pago (ver ADR-050,
  "Consecuencias").
- Si el precio final de un lote supera el monto de la garantía capturada, el cobro de
  la diferencia sigue el flujo manual existente de `PostAuctionCase` -- no se
  automatiza en esta v1.
